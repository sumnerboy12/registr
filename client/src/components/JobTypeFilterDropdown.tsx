import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { JobType } from '../types';
import { JOB_TYPE_LABELS } from '../types';

export const ALL_JOB_TYPES = Object.keys(JOB_TYPE_LABELS) as JobType[];

interface Props {
  value: JobType[];
  onChange: (next: JobType[]) => void;
  style?: CSSProperties;
}

// Same interaction pattern as StatusFilterDropdown, just without an
// "Active" shortcut — there's no natural active subset of job types, only
// all-or-none-or-some.
export default function JobTypeFilterDropdown({ value, onChange, style }: Props) {
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

  const toggle = (type: JobType) => {
    onChange(value.includes(type) ? value.filter((t) => t !== type) : [...value, type]);
  };

  const selectedLabels = ALL_JOB_TYPES.filter((t) => value.includes(t)).map((t) => JOB_TYPE_LABELS[t]);

  const summary =
    value.length === ALL_JOB_TYPES.length
      ? 'All job types'
      : value.length === 0
        ? 'No job types'
        : value.length === 1
          ? JOB_TYPE_LABELS[value[0]]
          : `${value.length} job types`;

  const tooltip = value.length === 0 ? 'No job types selected' : selectedLabels.join(', ');

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
            <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => onChange(ALL_JOB_TYPES)}>
              All
            </button>
            <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => onChange([])}>
              None
            </button>
          </div>
          {ALL_JOB_TYPES.map((type) => (
            <label
              key={type}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, cursor: 'pointer' }}
            >
              <input type="checkbox" style={{ width: 'auto' }} checked={value.includes(type)} onChange={() => toggle(type)} />
              {JOB_TYPE_LABELS[type]}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
