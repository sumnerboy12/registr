import { useState, type ReactNode } from 'react';

interface Item {
  id: number;
}

interface Props<T extends Item> {
  label: ReactNode;
  items: T[];
  selectedIds: number[];
  onToggle: (id: number, checked: boolean) => void;
  disabled?: boolean;
  emptyMessage?: string;
  matchesSearch: (item: T, query: string) => boolean;
  renderItem: (item: T) => ReactNode;
}

// Generic checkbox list with a right-aligned search box and All/None
// shortcuts, shared by every multi-select picker in the app (see
// PersonMultiSelectList) so the search/filter/bulk-select behaviour lives
// in one place.
export default function SearchableCheckboxList<T extends Item>({
  label,
  items,
  selectedIds,
  onToggle,
  disabled,
  emptyMessage = 'Nothing available.',
  matchesSearch,
  renderItem,
}: Props<T>) {
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const filtered = q ? items.filter((item) => matchesSearch(item, q)) : items;

  // All/None only ever act on what's currently filtered (the search
  // results), not the whole list — so narrowing it down first and then
  // hitting All doesn't sweep in everything else too.
  const selectFiltered = () => {
    for (const item of filtered) {
      if (!selectedIds.includes(item.id)) onToggle(item.id, true);
    }
  };
  const deselectFiltered = () => {
    for (const item of filtered) {
      if (selectedIds.includes(item.id)) onToggle(item.id, false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
        <label>{label}</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={selectFiltered} disabled={disabled}>
            All
          </button>
          <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={deselectFiltered} disabled={disabled}>
            None
          </button>
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 130, fontSize: 12, padding: '3px 8px' }}
          />
        </div>
      </div>
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 6,
          maxHeight: 170,
          overflowY: 'auto',
          padding: '4px 8px',
        }}
      >
        {filtered.map((item) => (
          <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 14 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={selectedIds.includes(item.id)}
              onChange={(ev) => onToggle(item.id, ev.target.checked)}
              disabled={disabled}
            />
            {renderItem(item)}
          </label>
        ))}
        {filtered.length === 0 && (
          <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '4px 0' }}>
            {items.length === 0 ? emptyMessage : 'No matches.'}
          </div>
        )}
      </div>
    </div>
  );
}
