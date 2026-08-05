interface Props {
  env: string;
}

// server/src/index.js defaults APP_ENV to "production", so anything else
// here means this is a dev/test deployment, not the real one — worth
// calling out so nobody mistakes it for production or trusts its data.
export default function EnvBadge({ env }: Props) {
  if (env === 'production') return null;

  return (
    <span
      title={`Running against a ${env} server, not production`}
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: 'var(--warn)',
        border: '1px solid var(--warn)',
        borderRadius: 4,
        padding: '2px 6px',
      }}
    >
      {env}
    </span>
  );
}
