// Generic exception-flag icon shown next to a job's name (JobsPage
// list/board rows, JobHeader) or a person's name (PeoplePage). Any number of
// independent checks (e.g. ThinkSafe) can each contribute a reason string —
// the caller collects them into `reasons`; nothing renders when it's empty,
// since that's the expected, unremarkable case. All reasons show together in
// one tooltip on hover, so a single icon covers however many checks fail.
interface Props {
  reasons: string[];
}

export default function WarningBadge({ reasons }: Props) {
  if (reasons.length === 0) return null;
  return (
    <span
      title={reasons.join('\n')}
      style={{
        display: 'inline-flex',
        verticalAlign: 'middle',
        color: 'var(--warn)',
        cursor: 'default',
      }}
    >
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </span>
  );
}
