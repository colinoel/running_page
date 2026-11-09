import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';

const RESULT_KEY = 'garmin-import-result';

interface ImportResult {
  ok: boolean;
  error?: string;
  added?: number;
  total?: number;
  latest?: string | null;
  published?: boolean | null;
}

function describe(result: ImportResult) {
  if (!result.ok) return result.error ?? 'Import failed.';
  const latest = result.latest ? ` Latest: ${result.latest.slice(0, 10)}.` : '';
  if (!result.added)
    return `Already up to date (${result.total} activities).${latest}`;
  const online = result.published
    ? ' Your site updates online in about 2 minutes.'
    : ' Online upload failed; the site still has the old data.';
  return `Added ${result.added} new ${result.added === 1 ? 'activity' : 'activities'} (${result.total} total).${latest}${online}`;
}

function takeSavedResult(): ImportResult | null {
  try {
    const saved = sessionStorage.getItem(RESULT_KEY);
    sessionStorage.removeItem(RESULT_KEY);
    return saved ? (JSON.parse(saved) as ImportResult) : null;
  } catch {
    return null;
  }
}

/** Drop a Garmin account export here to import new activities (local dev only). */
export function GarminImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(takeSavedResult);

  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setResult({
        ok: false,
        error: 'Please choose the .zip file from Garmin.',
      });
      return;
    }
    setBusy(true);
    setResult(null);
    let next: ImportResult;
    try {
      const response = await fetch('/api/garmin-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/zip' },
        body: file,
      });
      next = (await response.json()) as ImportResult;
    } catch {
      next = { ok: false, error: 'The local server did not respond.' };
    }
    setBusy(false);
    if (next.ok && next.added) {
      try {
        sessionStorage.setItem(RESULT_KEY, JSON.stringify(next));
      } catch {
        // The page still reloads with the new data, just without the message.
      }
      window.location.reload();
      return;
    }
    setResult(next);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void upload(event.dataTransfer.files[0]);
  };

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    void upload(event.target.files?.[0]);
    event.target.value = '';
  };

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <h2 className="mb-3 text-base font-semibold">Import Garmin data</h2>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`w-full cursor-pointer rounded-lg border border-dashed p-5 text-center text-sm transition-colors disabled:cursor-wait ${
          dragging
            ? 'border-[var(--color-accent)] text-[var(--color-text)]'
            : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'
        }`}
      >
        {busy
          ? 'Importing… please keep this page open.'
          : 'Drop your Garmin export ZIP here, or click to choose it'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={onPick}
      />
      {result && (
        <p
          role="status"
          className={`mt-3 text-xs ${result.ok ? 'text-[var(--color-text)]' : 'text-red-400'}`}
        >
          {describe(result)}
        </p>
      )}
    </section>
  );
}
