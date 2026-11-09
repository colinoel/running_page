import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';

export type GoalPeriod = 'yearly' | 'monthly' | 'weekly';
type GoalOverrides = Record<string, Partial<Record<GoalPeriod, number>>>;

const STORAGE_KEY = 'running-page-goals';
const MAX_GOAL = 1_000_000;

function loadOverrides(): GoalOverrides {
  try {
    return JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? '{}'
    ) as GoalOverrides;
  } catch {
    return {};
  }
}

/** Goals changed on the page; they take precedence over config.yml. */
export function useGoalOverrides() {
  const [overrides, setOverrides] = useState(loadOverrides);

  const saveGoal = useCallback(
    (filter: string, period: GoalPeriod, value: number) => {
      setOverrides((current) => {
        const next = {
          ...current,
          [filter]: { ...current[filter], [period]: value },
        };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Still applies until the page is closed.
        }
        return next;
      });
    },
    []
  );

  return { overrides, saveGoal };
}

const iconClass = 'h-3.5 w-3.5';

export function GoalEditButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="ml-auto cursor-pointer rounded p-1 text-[var(--color-muted)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
    >
      <svg
        className={iconClass}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.232 5.232l3.536 3.536M4 20l1-4.5L16.732 3.768a2 2 0 012.828 0l.672.672a2 2 0 010 2.828L8.5 19 4 20z"
        />
      </svg>
    </button>
  );
}

export function GoalInput({
  label,
  value,
  unit,
  onSave,
  onCancel,
}: {
  label: string;
  value: number;
  unit: string;
  onSave: (value: number) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(String(value));
  const parsed = Number(text.replace(',', '.'));
  const valid = parsed > 0 && parsed <= MAX_GOAL;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) onSave(parsed);
  };

  return (
    <form
      onSubmit={submit}
      className="ml-1 inline-flex items-center gap-1 text-base font-normal text-[var(--color-muted)]"
    >
      /
      <input
        autoFocus
        inputMode="decimal"
        aria-label={label}
        aria-invalid={!valid}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onFocus={(event) => event.target.select()}
        onKeyDown={(event) => event.key === 'Escape' && onCancel()}
        className="w-16 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
      />
      {unit}
      <button
        type="submit"
        disabled={!valid}
        aria-label="Save goal"
        title="Save"
        className="cursor-pointer rounded p-0.5 text-[var(--color-accent)] disabled:cursor-default disabled:opacity-30"
      >
        <svg
          className={iconClass}
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
