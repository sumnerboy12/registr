import type { Client, Job } from '../types';
import { JOB_STATUS_LABELS, JOB_TYPE_LABELS } from '../types';
import { NO_CLIENT_COLOR } from '../lib/colors';
import ThinkSafeBadge from './ThinkSafeBadge';

interface JobHeaderProps {
  job: Job;
  client?: Client;
  backLabel: string;
  onBack: () => void;
  // An extra button shown before the back button — e.g. JobDetailPage's
  // link through to the QA Checklist page, kept up here so it's visible
  // without scrolling rather than buried among the page's other cards.
  secondaryAction?: { label: string; onClick: () => void };
}

// Shared by JobDetailPage and JobChecklistPage so both show the exact same
// job summary — name, then client/status/type/code/value all on one line.
export default function JobHeader({ job, client, backLabel, onBack, secondaryAction }: JobHeaderProps) {
  const showValue = job.job_type !== 'remedial' && job.value != null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 20, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>{job.name}</span>
          {job.thinksafe_site && <ThinkSafeBadge title="Site configured on ThinkSafe" />}
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {secondaryAction && (
            <button className="btn" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </button>
          )}
          <button className="btn" onClick={onBack}>
            {backLabel}
          </button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-block',
            padding: '1px 7px',
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
            background: client?.color ?? NO_CLIENT_COLOR,
            color: '#fff',
          }}
        >
          {client?.name ?? job.client_name ?? 'No client'}
        </span>
        <span>&middot;</span>
        <span>{JOB_STATUS_LABELS[job.status]}</span>
        <span>&middot;</span>
        <span>{JOB_TYPE_LABELS[job.job_type]}</span>
        <span>&middot;</span>
        <span>{job.code}</span>
        {showValue && (
          <>
            <span>&middot;</span>
            <span>${job.value!.toLocaleString('en-US')}</span>
          </>
        )}
      </div>
    </div>
  );
}
