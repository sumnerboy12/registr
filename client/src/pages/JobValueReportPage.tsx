import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { JobStatus, JobType, JobValueSummaryRow } from '../types';
import { JOB_STATUS_LABELS, JOB_TYPE_LABELS } from '../types';

// Declaration order of JOB_STATUS_LABELS/JOB_TYPE_LABELS doubles as the
// display order here, same as the Status/Type filter dropdowns elsewhere.
const STATUSES = Object.keys(JOB_STATUS_LABELS) as JobStatus[];
const TYPES = Object.keys(JOB_TYPE_LABELS) as JobType[];

const formatValue = (value: number) => (value > 0 ? `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—');

export default function JobValueReportPage() {
  const [rows, setRows] = useState<JobValueSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getJobValueSummary().then((data) => {
      setRows(data);
      setLoading(false);
    });
  }, []);

  // Zero-filled lookup — the server only sends combinations with at least
  // one job (see routes/reports.js), so any status/type pairing with none
  // just resolves to the { count: 0, total_value: 0 } fallback below.
  const cell = (status: JobStatus, jobType: JobType) =>
    rows.find((r) => r.status === status && r.job_type === jobType) ?? { count: 0, total_value: 0 };

  const rowTotal = (status: JobStatus) =>
    TYPES.reduce(
      (acc, jobType) => {
        const c = cell(status, jobType);
        return { count: acc.count + c.count, total_value: acc.total_value + c.total_value };
      },
      { count: 0, total_value: 0 }
    );

  const columnTotal = (jobType: JobType) =>
    STATUSES.reduce(
      (acc, status) => {
        const c = cell(status, jobType);
        return { count: acc.count + c.count, total_value: acc.total_value + c.total_value };
      },
      { count: 0, total_value: 0 }
    );

  const grandTotal = TYPES.reduce(
    (acc, jobType) => {
      const t = columnTotal(jobType);
      return { count: acc.count + t.count, total_value: acc.total_value + t.total_value };
    },
    { count: 0, total_value: 0 }
  );

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Job Value</h1>
      </div>
      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        Total job value, grouped by type and status. A blank cell means no jobs in that
        combination; jobs with no value set don't contribute to any total.
      </p>

      <div className="card">
        {loading ? (
          <div style={{ padding: 20 }}>Loading…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Status</th>
                {TYPES.map((jobType) => (
                  <th key={jobType}>{JOB_TYPE_LABELS[jobType]}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {STATUSES.map((status) => {
                const total = rowTotal(status);
                return (
                  <tr key={status}>
                    <td>{JOB_STATUS_LABELS[status]}</td>
                    {TYPES.map((jobType) => {
                      const c = cell(status, jobType);
                      return (
                        <td key={jobType}>
                          {formatValue(c.total_value)}
                          {c.count > 0 && (
                            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}> ({c.count})</span>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ fontWeight: 600 }}>
                      {formatValue(total.total_value)}
                      {total.count > 0 && <span style={{ color: 'var(--text-dim)', fontSize: 12 }}> ({total.count})</span>}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 600 }}>
                <td>Total</td>
                {TYPES.map((jobType) => {
                  const t = columnTotal(jobType);
                  return (
                    <td key={jobType}>
                      {formatValue(t.total_value)}
                      {t.count > 0 && <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: 12 }}> ({t.count})</span>}
                    </td>
                  );
                })}
                <td>
                  {formatValue(grandTotal.total_value)}
                  {grandTotal.count > 0 && (
                    <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: 12 }}> ({grandTotal.count})</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
