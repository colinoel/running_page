import { useState } from 'react';
import type { FormEvent } from 'react';
import { GoalEditButton } from './GoalEditor';

type Lift = 'pushups' | 'pullups' | 'bench';

interface LiftRecord {
  value: number;
  date: string;
}

const STORAGE_KEY = 'running-journal-strength-prs';

const LIFTS: { id: Lift; label: string; unit: string; decimals: boolean }[] = [
  { id: 'pushups', label: 'Push-ups', unit: 'reps', decimals: false },
  { id: 'pullups', label: 'Pull-ups', unit: 'reps', decimals: false },
  { id: 'bench', label: 'Bench press', unit: 'kg', decimals: true },
];

function loadRecords(): Partial<Record<Lift, LiftRecord>> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const formatDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

function RecordInput({
  label,
  unit,
  value,
  decimals,
  onSave,
  onCancel,
}: {
  label: string;
  unit: string;
  value?: number;
  decimals: boolean;
  onSave: (value: number) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const parsed = Number(text.replace(',', '.'));
  const valid =
    text.trim() !== '' &&
    parsed > 0 &&
    parsed <= 10000 &&
    (decimals || Number.isInteger(parsed));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) onSave(parsed);
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-1 text-sm">
      <input
        autoFocus
        inputMode={decimals ? 'decimal' : 'numeric'}
        aria-label={label}
        aria-invalid={!valid}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onFocus={(event) => event.target.select()}
        onKeyDown={(event) => event.key === 'Escape' && onCancel()}
        className="w-16 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 text-right font-mono text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
      />
      <span className="text-xs text-[var(--color-muted)]">{unit}</span>
      <button
        type="submit"
        disabled={!valid}
        aria-label="Save record"
        title="Save"
        className="cursor-pointer rounded p-0.5 text-[var(--color-accent)] disabled:cursor-default disabled:opacity-30"
      >
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </button>
    </form>
  );
}

/** Strength personal records, edited on the page and kept in this browser. */
export function StrengthPRs() {
  const [records, setRecords] = useState(loadRecords);
  const [editing, setEditing] = useState<Lift | null>(null);

  const save = (lift: Lift, value: number) => {
    setRecords((current) => {
      const next = { ...current, [lift]: { value, date: today() } };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Still shown until the page is closed.
      }
      return next;
    });
    setEditing(null);
  };

  return (
    <section
      aria-label="Strength records"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
    >
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <svg
          className="h-4 w-4 text-[var(--color-accent)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12"
          />
        </svg>
        Strength PRs
      </h2>
      <ul className="divide-y divide-[var(--color-border)]">
        {LIFTS.map(({ id, label, unit, decimals }) => {
          const record = records[id];
          return (
            <li key={id} className="flex min-h-11 items-center gap-2 py-1.5">
              <span className="text-sm">{label}</span>
              <span className="ml-auto flex items-center gap-1">
                {editing === id ? (
                  <RecordInput
                    label={`${label} record`}
                    unit={unit}
                    value={record?.value}
                    decimals={decimals}
                    onSave={(value) => save(id, value)}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <>
                    <span className="text-right">
                      <span className="block font-mono text-sm font-bold text-[var(--color-accent)]">
                        {record ? (
                          <>
                            {record.value.toLocaleString('en-US')}{' '}
                            <span className="font-sans text-xs font-normal text-[var(--color-muted)]">
                              {unit}
                            </span>
                          </>
                        ) : (
                          <span className="text-[var(--color-muted)]">—</span>
                        )}
                      </span>
                      {record && (
                        <span className="block text-[10px] text-[var(--color-muted)]">
                          {formatDate(record.date)}
                        </span>
                      )}
                    </span>
                    <GoalEditButton
                      label={`Edit ${label.toLowerCase()} record`}
                      onClick={() => setEditing(id)}
                    />
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
