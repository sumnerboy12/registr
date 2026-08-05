import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { JobStatus } from '../types';
import { JOB_STATUS_LABELS } from '../types';

export const ALL_STATUSES = Object.keys(JOB_STATUS_LABELS) as JobStatus[];
// Explicit JobStatus[] annotation — otherwise TS infers an accidental
// narrowed type predicate from the !== chain (excluding only the three
// literals compared here), which then rejects a plain JobStatus argument
// anywhere this array is used with .includes().
export const ACTIVE_STATUSES: JobStatus[] = ALL_STATUSES.filter((s) => s !== 'closed' && s !== 'lost' && s !== 'on_hold');

interface Props {
  value: JobStatus[];
  onChange: (next: JobStatus[]) => void;
  style?: CSSProperties;
  // Restricts which statuses are offered (e.g. hiding the Contract-only
  // ones when Contract isn't in the Type filter) — defaults to all of them.
  statuses?: JobStatus[];
}

export default function StatusFilterDropdown({ value, onChange, style, statuses = ALL_STATUSES }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const toggle = (status: JobStatus) => {
    onChange(value.includes(status) ? value.filter((s) => s !== status) : [...value, status]);
  };

  const visibleValue = value.filter((s) => statuses.includes(s));
  const selectedLabels = statuses.filter((s) => visibleValue.includes(s)).map((s) => JOB_STATUS_LABELS[s]);
  const activeStatuses = ACTIVE_STATUSES.filter((s) => statuses.includes(s));
  const isSameSet = (a: JobStatus[], b: JobStatus[]) => a.length === b.length && a.every((s) => b.includes(s));

  const summary =
    visibleValue.length === statuses.length
      ? 'All jobs'
      : isSameSet(visibleValue, activeStatuses)
        ? 'Active jobs'
        : visibleValue.length === 0
          ? 'No jobs'
          : visibleValue.length === 1
            ? JOB_STATUS_LABELS[visibleValue[0]]
            : `${visibleValue.length} job statuses`;

  const tooltip = visibleValue.length === 0 ? 'No statuses selected' : selectedLabels.join(', ');

  return (
    <div ref={rootRef} style={{ position: 'relative', width: 160, ...style }}>
      <button
        type="button"
        className="btn"
        onClick={() => setOpen((o) => !o)}
        title={tooltip}
        style={{ width: '100%', textAlign: 'left' }}
      >
        {summary}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 20,
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 8,
            minWidth: 180,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => onChange(statuses)}>
              All
            </button>
            <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => onChange(activeStatuses)}>
              Active
            </button>
            <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => onChange([])}>
              None
            </button>
          </div>
          {statuses.map((status) => (
            <label
              key={status}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, cursor: 'pointer' }}
            >
              <input type="checkbox" style={{ width: 'auto' }} checked={value.includes(status)} onChange={() => toggle(status)} />
              {JOB_STATUS_LABELS[status]}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
