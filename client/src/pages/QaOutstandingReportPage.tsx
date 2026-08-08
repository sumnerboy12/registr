import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { JobStatus, JobType, QaOutstandingJob } from '../types';
import {
  CHECKLIST_ITEM_STATUS_COLORS,
  CHECKLIST_ITEM_STATUS_LABELS,
  CHECKLIST_STAGES,
  CHECKLIST_STAGE_LABELS,
  JOB_STATUS_LABELS,
  JOB_TYPE_LABELS,
} from '../types';
import { useAuth } from '../auth/AuthContext';
import { NO_CLIENT_COLOR } from '../lib/colors';

const STATUSES = Object.keys(JOB_STATUS_LABELS) as JobStatus[];
const TYPES = Object.keys(JOB_TYPE_LABELS) as JobType[];

export default function QaOutstandingReportPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<QaOutstandingJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<JobStatus | ''>('');
  const [jobType, setJobType] = useState<JobType | ''>('');
  const [mineOnly, setMineOnly] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .getQaOutstandingReport({ status: status || undefined, type: jobType || undefined, mine: mineOnly })
      .then(setJobs)
      .finally(() => setLoading(false));
  }, [status, jobType, mineOnly]);

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, margin: '0 0 4px' }}>QA Check</h1>
      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        Every job with at least one checklist item that isn't Done or Won't Do yet.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value as JobStatus | '')} style={{ width: 200 }}>
          <option value="">All job statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {JOB_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select value={jobType} onChange={(e) => setJobType(e.target.value as JobType | '')} style={{ width: 160 }}>
          <option value="">All job types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {JOB_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        {user?.id != null && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            My jobs only
          </label>
        )}
      </div>

      {loading ? (
        <div className="card" style={{ padding: 20 }}>
          Loading…
        </div>
      ) : jobs.length === 0 ? (
        <div className="card" style={{ padding: 20, color: 'var(--text-dim)' }}>
          No jobs with outstanding QA items for these filters.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {jobs.map((job) => (
            <div key={job.id} className="card" style={{ padding: 16 }}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{job.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '1px 7px',
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                      background: job.client_color ?? NO_CLIENT_COLOR,
                      color: '#fff',
                    }}
                  >
                    {job.client_name ?? 'No client'}
                  </span>
                  <span>&middot;</span>
                  <span>{JOB_STATUS_LABELS[job.status]}</span>
                  <span>&middot;</span>
                  <span>{JOB_TYPE_LABELS[job.job_type]}</span>
                  <span>&middot;</span>
                  <Link to={`/jobs/${job.code}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                    {job.code}
                  </Link>
                  {job.pm_name && (
                    <>
                      <span>&middot;</span>
                      <span>PM: {job.pm_name}</span>
                    </>
                  )}
                </div>
              </div>
              {CHECKLIST_STAGES.map((stage) => {
                const stageItems = job.items.filter((i) => i.stage === stage);
                if (stageItems.length === 0) return null;
                return (
                  <div key={stage} style={{ marginBottom: 6 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--text-dim)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.02em',
                        marginBottom: 4,
                      }}
                    >
                      {CHECKLIST_STAGE_LABELS[stage]}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {stageItems.map((item, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: 12,
                            padding: '2px 8px',
                            borderRadius: 999,
                            color: 'white',
                            background: CHECKLIST_ITEM_STATUS_COLORS[item.status],
                          }}
                        >
                          {item.label} ({CHECKLIST_ITEM_STATUS_LABELS[item.status]})
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
