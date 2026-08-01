export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

// Deliberately loose: tab-separated (Excel/Sheets paste) or comma-separated
// (CSV) with basic quote handling — not a strict RFC4180 parser.
export function parseDelimited(text: string): ParsedTable {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const delimiter = lines[0].includes('\t') ? '\t' : ',';

  const parseLine = (line: string): string[] => {
    if (delimiter === '\t') return line.split('\t').map((c) => c.trim());

    const cells: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

function normalizeHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Returns the index of the header matching one of the given aliases, or -1.
export function autoMatchColumn(headers: string[], aliases: string[]): number {
  const normHeaders = headers.map(normalizeHeader);
  const normAliases = aliases.map(normalizeHeader);
  for (const alias of normAliases) {
    const idx = normHeaders.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
