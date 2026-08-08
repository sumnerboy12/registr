import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { ChecklistItemAttachment, Client, Job, JobChecklistItem } from '../types';
import {
  CHECKLIST_ITEM_STATUS_COLORS,
  CHECKLIST_ITEM_STATUS_LABELS,
  CHECKLIST_STAGES,
  CHECKLIST_STAGE_LABELS,
} from '../types';
import { NO_CLIENT_COLOR } from '../lib/colors';

// A standalone, print-friendly view of a job's full QA checklist — every
// item regardless of status, with notes and (image-only) attachments, but
// no comment threads, since this is meant to be handed to a customer, not
// an internal discussion log. Opened in its own tab from JobDetailPage's
// "Export to PDF" button; "export" here means the browser's own
// print-to-PDF (window.print, with "Save as PDF" as the destination)
// rather than a generated file, so there's no new PDF-rendering dependency
// to maintain. Deliberately rendered outside <Layout> (see App.tsx) — no
// app chrome to hide for print.
export default function JobQaReportPage() {
  const { code } = useParams();
  const [job, setJob] = useState<Job | null>(null);
  const [client, setClient] = useState<Client | undefined>(undefined);
  const [checklist, setChecklist] = useState<JobChecklistItem[]>([]);
  const [imagesByItem, setImagesByItem] = useState<Record<number, ChecklistItemAttachment[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    api
      .getJobByCode(code)
      .then(async (j) => {
        setJob(j);
        if (j.client_id != null) {
          api.getClients().then((all) => setClient(all.find((c) => c.id === j.client_id)));
        }
        // Internal items are left out of this customer-facing export entirely
        // — not shown, not counted, no point fetching their attachments.
        const items = (await api.getJobChecklist(j.id)).filter((i) => !i.internal);
        setChecklist(items);
        const withAttachments = items.filter((i) => i.attachment_count > 0);
        const entries = await Promise.all(
          withAttachments.map(async (i) => {
            const attachments = await api.getChecklistItemAttachments(j.id, i.id);
            return [i.id, attachments.filter((a) => a.content_type.startsWith('image/'))] as const;
          })
        );
        setImagesByItem(Object.fromEntries(entries.filter(([, imgs]) => imgs.length > 0)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>;
  if (error || !job) return <div style={{ padding: 40, color: '#b00020' }}>{error ?? 'Job not found'}</div>;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px', fontFamily: 'system-ui, sans-serif', color: '#111', background: 'white' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
        }
      `}</style>

      <button className="btn btn-primary no-print" style={{ marginBottom: 24 }} onClick={() => window.print()}>
        Print / Save as PDF
      </button>

      <h1 style={{ fontSize: 22, marginBottom: 4 }}>QA Report — {job.name}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#555', fontSize: 14, marginBottom: 28 }}>
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
        <span>·</span>
        <Link to={`/jobs/${encodeURIComponent(job.code)}`} className="no-print" style={{ color: '#2f8f7a' }}>
          {job.code}
        </Link>
        {job.site_address && (
          <>
            <span>·</span>
            <span>{job.site_address}</span>
          </>
        )}
      </div>

      {checklist.length === 0 ? (
        <div style={{ color: '#555' }}>No checklist items.</div>
      ) : (
        CHECKLIST_STAGES.map((stage) => {
          const stageItems = checklist.filter((i) => i.stage === stage).sort((a, b) => a.sequence - b.sequence);
          if (stageItems.length === 0) return null;
          return (
            <div key={stage} style={{ marginBottom: 24, breakInside: 'avoid' }}>
              <h2 style={{ fontSize: 16, borderBottom: '1px solid #ccc', paddingBottom: 4, marginBottom: 12 }}>
                {CHECKLIST_STAGE_LABELS[stage]}
              </h2>
              {stageItems.map((item) => (
                <div key={item.id} style={{ marginBottom: 16, breakInside: 'avoid' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'white',
                        background: CHECKLIST_ITEM_STATUS_COLORS[item.status],
                        borderRadius: 4,
                        padding: '2px 8px',
                        minWidth: 90,
                        textAlign: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {CHECKLIST_ITEM_STATUS_LABELS[item.status]}
                    </span>
                    <span style={{ fontWeight: 500 }}>{item.label}</span>
                  </div>
                  {item.notes && (
                    <div style={{ fontSize: 13, color: '#333', marginTop: 4, marginLeft: 2, whiteSpace: 'pre-wrap' }}>{item.notes}</div>
                  )}
                  {imagesByItem[item.id] && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                      {imagesByItem[item.id].map((a) => (
                        <img
                          key={a.id}
                          src={`/api/v1/jobs/${job.id}/checklist/${item.id}/attachments/${a.id}`}
                          alt={a.original_name}
                          style={{ maxWidth: 240, maxHeight: 240, borderRadius: 4, border: '1px solid #ddd', breakInside: 'avoid' }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })
      )}

      <div style={{ marginTop: 40, fontSize: 11, color: '#999' }}>Generated {new Date().toLocaleString()}</div>
    </div>
  );
}
