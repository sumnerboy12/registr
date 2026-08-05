// Shown next to a job's name (JobsPage list/board rows, JobDetailPage) when
// ThinkSafe (Wayman's H&S system) has a site matching that job's code, or a
// person's name (PeoplePage) when ThinkSafe has a matching user — see
// server/src/lib/thinksafeSync.js. Nothing renders if there's no match;
// there's no "not on ThinkSafe" state to show.
interface Props {
  title?: string;
}

export default function ThinkSafeBadge({ title = 'Configured on ThinkSafe' }: Props) {
  return (
    <span
      className="badge"
      title={title}
      style={{
        display: 'inline-block',
        padding: '1px 7px',
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
        color: 'var(--accent)',
        border: '1px solid var(--accent)',
        background: 'transparent',
      }}
    >
      H&amp;S
    </span>
  );
}
