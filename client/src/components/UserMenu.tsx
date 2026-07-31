import { useEffect, useRef, useState } from 'react';

interface Props {
  name: string;
  showChangePassword: boolean;
  onChangePassword: () => void;
  onLogout: () => void;
}

export default function UserMenu({ name, showChangePassword, onChangePassword, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: '6px 10px',
          color: 'var(--text-dim)',
          background: 'transparent',
          border: 'none',
          borderRadius: 6,
          fontWeight: 500,
          fontSize: 13,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {name}
        <span style={{ fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            zIndex: 20,
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 4,
            minWidth: 160,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
          }}
        >
          {showChangePassword && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setOpen(false);
                onChangePassword();
              }}
              style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent' }}
            >
              Change password
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent' }}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
