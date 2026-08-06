import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api/client';
import type { Person, ReportTypeOption, ScheduledReport } from '../types';
import { useAuth } from '../auth/AuthContext';
import ScheduledReportModal from '../components/ScheduledReportModal';

const DAY_LABELS: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

const PERIOD_LABELS: Record<string, string> = {
  this_week: 'This week',
  next_week: 'Next week',
  next_two_weeks: 'Next two weeks',
};

export default function ScheduledReportsPage() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<ScheduledReport[]>([]);
  const [reportTypes, setReportTypes] = useState<ReportTypeOption[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<ScheduledReport | null>(null);
  const [sendResults, setSendResults] = useState<Record<number, string>>({});

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([api.getScheduledReports(), api.getReportTypes(), api.getPeople({ active: true })])
      .then(([s, r, p]) => {
        setSchedules(s);
        setReportTypes([...r].sort((a, b) => a.label.localeCompare(b.label)));
        setPeople(p);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (user?.role !== 'admin') return <Navigate to="/" replace />;

  const handleSendNow = async (id: number) => {
    setSendResults((prev) => ({ ...prev, [id]: 'Sending…' }));
    try {
      await api.sendScheduledReportNow(id);
      setSendResults((prev) => ({ ...prev, [id]: 'Sent' }));
    } catch (e) {
      setSendResults((prev) => ({ ...prev, [id]: e instanceof Error ? e.message : 'Failed to send' }));
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Scheduled Reports</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)} disabled={reportTypes.length === 0}>
          + Add Scheduled Report
        </button>
      </div>
      <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>
        Automatically email a report to a chosen list of people on a recurring day and time.
        {reportTypes.length === 0 && ' No report types are configured yet.'}
      </p>
      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

      <div className="card">
        {loading ? (
          <div style={{ padding: 20 }}>Loading…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Report</th>
                <th>Day / Time</th>
                <th>Period</th>
                <th>Recipients</th>
                <th>Last sent</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.id} style={{ opacity: s.enabled ? 1 : 0.5 }}>
                  <td>{s.label}</td>
                  <td>
                    {DAY_LABELS[s.day_of_week] ?? s.day_of_week} {s.time}
                  </td>
                  <td>{PERIOD_LABELS[s.period] ?? s.period}</td>
                  <td>{s.recipients.length}</td>
                  <td>{s.last_sent_date ?? '—'}</td>
                  <td>{s.enabled ? 'Enabled' : 'Disabled'}</td>
                  <td style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn" onClick={() => handleSendNow(s.id)}>
                      Send now
                    </button>
                    <button className="btn" onClick={() => setEditing(s)}>
                      Edit
                    </button>
                    {sendResults[s.id] && <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{sendResults[s.id]}</span>}
                  </td>
                </tr>
              ))}
              {schedules.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 24 }}>
                    No scheduled reports yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <ScheduledReportModal
          schedule={null}
          reportTypes={reportTypes}
          people={people}
          onClose={() => setShowAdd(false)}
          onSave={async (data) => {
            await api.createScheduledReport(data);
            load();
          }}
        />
      )}
      {editing && (
        <ScheduledReportModal
          schedule={editing}
          reportTypes={reportTypes}
          people={people}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await api.updateScheduledReport(editing.id, data);
            load();
          }}
          onDelete={async (id) => {
            await api.deleteScheduledReport(id);
            load();
          }}
        />
      )}
    </div>
  );
}
