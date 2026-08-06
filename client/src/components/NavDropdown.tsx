import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

interface Item {
  to: string;
  label: string;
  // Renders a separator line above this item — for setting an item apart
  // from the rest of the list (e.g. an admin-only item at the bottom).
  divider?: boolean;
}

export default function NavDropdown({ label, items }: { label: string; items: Item[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const isActive = items.some((i) => location.pathname.startsWith(i.to));

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
          padding: '10px 16px',
          color: isActive ? 'white' : 'var(--text-dim)',
          background: isActive ? 'var(--nav-accent)' : 'transparent',
          border: 'none',
          borderRadius: 6,
          fontWeight: isActive ? 600 : 500,
          fontSize: 14,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {label}
        <span style={{ fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 20,
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 4,
            minWidth: 160,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
          }}
        >
          {items.map((item) => (
            <div key={item.to}>
              {item.divider && <div style={{ height: 1, background: 'var(--border)', margin: '4px 4px' }} />}
              <NavLink
                to={item.to}
                onClick={() => setOpen(false)}
                style={({ isActive: linkActive }) => ({
                  display: 'block',
                  padding: '8px 12px',
                  borderRadius: 4,
                  color: linkActive ? 'white' : 'var(--text)',
                  background: linkActive ? 'var(--nav-accent)' : 'transparent',
                  textDecoration: 'none',
                  fontWeight: linkActive ? 600 : 500,
                  fontSize: 14,
                })}
              >
                {item.label}
              </NavLink>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
