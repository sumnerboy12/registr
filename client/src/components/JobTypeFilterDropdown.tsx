import type { CSSProperties } from 'react';
import type { JobType } from '../types';
import { JOB_TYPE_LABELS } from '../types';

export const ALL_JOB_TYPES = Object.keys(JOB_TYPE_LABELS) as JobType[];

interface Props {
  value: JobType[];
  onChange: (next: JobType[]) => void;
  style?: CSSProperties;
}

// Toggle buttons rather than a dropdown — with only 3 job types, clicking
// the one(s) you want is quicker than opening a panel and checking boxes.
export default function JobTypeFilterDropdown({ value, onChange, style }: Props) {
  const toggle = (type: JobType) => {
    onChange(value.includes(type) ? value.filter((t) => t !== type) : [...value, type]);
  };

  return (
    <div style={{ display: 'flex', gap: 4, ...style }}>
      {ALL_JOB_TYPES.map((type) => {
        const active = value.includes(type);
        return (
          <button
            key={type}
            type="button"
            className="btn"
            onClick={() => toggle(type)}
            style={{ background: active ? 'var(--accent)' : undefined, borderColor: active ? 'var(--accent)' : undefined }}
          >
            {JOB_TYPE_LABELS[type]}
          </button>
        );
      })}
    </div>
  );
}
