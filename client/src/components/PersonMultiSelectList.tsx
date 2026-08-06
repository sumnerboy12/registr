import type { ReactNode } from 'react';
import SearchableCheckboxList from './SearchableCheckboxList';

interface SearchablePerson {
  id: number;
  name: string;
  role?: string | null;
}

interface Props<T extends SearchablePerson> {
  label: ReactNode;
  people: T[];
  selectedIds: number[];
  onToggle: (id: number, checked: boolean) => void;
  disabled?: boolean;
  emptyMessage?: string;
}

// Thin wrapper around SearchableCheckboxList fixing the search fields
// (name, role) and item rendering ("Name (Role)") consistently across every
// people picker (e.g. Scheduled Report recipients).
export default function PersonMultiSelectList<T extends SearchablePerson>({
  label,
  people,
  selectedIds,
  onToggle,
  disabled,
  emptyMessage = 'No people available.',
}: Props<T>) {
  return (
    <SearchableCheckboxList
      label={label}
      items={people}
      selectedIds={selectedIds}
      onToggle={onToggle}
      disabled={disabled}
      emptyMessage={emptyMessage}
      matchesSearch={(p, q) => p.name.toLowerCase().includes(q) || (p.role ?? '').toLowerCase().includes(q)}
      renderItem={(p) => (
        <>
          {p.name}
          {p.role ? ` (${p.role})` : ''}
        </>
      )}
    />
  );
}
