import { useState } from 'react';
import type { Person, ReportPeriod, ReportTypeOption, ScheduledReport } from '../types';
import PersonMultiSelectList from './PersonMultiSelectList';

interface Props {
  schedule: ScheduledReport | null;
  reportTypes: ReportTypeOption[];
  people: Person[];
  onClose: () => void;
  onSave: (data: {
    report_type: string;
    enabled: boolean;
    day_of_week: number;
    time: string;
    period: ReportPeriod;
    recipient_person_ids: number[];
  }) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}

const DAY_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: 'this_week', label: 'This week' },
  { value: 'next_week', label: 'Next week' },
  { value: 'next_two_weeks', label: 'Next two weeks' },
];

export default function ScheduledReportModal({ schedule, reportTypes, people, onClose, onSave, onDelete }: Props) {
  const [reportType, setReportType] = useState(schedule?.report_type ?? reportTypes[0]?.key ?? '');
  const [dayOfWeek, setDayOfWeek] = useState(schedule?.day_of_week ?? 1);
  const [time, setTime] = useState(schedule?.time ?? '08:00');
  const [period, setPeriod] = useState<ReportPeriod>(schedule?.period ?? 'next_week');
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true);
  const [recipientIds, setRecipientIds] = useState<number[]>(schedule?.recipients.map((r) => r.id) ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleRecipient = (id: number, checked: boolean) => {
    setRecipientIds((prev) => (checked ? [...prev, id] : prev.filter((existing) => existing !== id)));
  };

  const handleSave = async () => {
    if (!reportType) return setError('Choose a report');
    setSaving(true);
    setError(null);
    try {
      await onSave({
        report_type: reportType,
        enabled,
        day_of_week: dayOfWeek,
        time,
        period,
        recipient_person_ids: recipientIds,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <h2>{schedule ? 'Edit Scheduled Report' : 'Add Scheduled Report'}</h2>

        <div className="field">
          <label>Report</label>
          <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
            {reportTypes.length === 0 && <option value="">No report types configured yet</option>}
            {reportTypes.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="row">
          <div className="field">
            <label>Day</label>
            <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
              {DAY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label>Period covered</label>
          <select value={period} onChange={(e) => setPeriod(e.target.value as ReportPeriod)}>
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <PersonMultiSelectList
            label={<>Recipients{recipientIds.length > 0 ? ` (${recipientIds.length} selected)` : ''}</>}
            people={people}
            selectedIds={recipientIds}
            onToggle={toggleRecipient}
            emptyMessage="No active people found."
          />
        </div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, fontSize: 14 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enabled
        </label>

        {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

        <div className="modal-actions">
          <div style={{ display: 'flex', gap: 8 }}>
            {schedule && onDelete && (
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (confirm('Remove this scheduled report?')) {
                    await onDelete(schedule.id);
                    onClose();
                  }
                }}
              >
                Delete
              </button>
            )}
          </div>
          <div className="right">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !reportType}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
