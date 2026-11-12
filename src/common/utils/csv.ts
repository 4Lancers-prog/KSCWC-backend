// csv.ts — CSV serialisation with spreadsheet formula-injection protection.
// Any cell beginning with = + - @ (or tab/CR) is prefixed with a single quote so
// spreadsheet apps treat it as text, not a formula. Quotes/commas/newlines are escaped.

export function escapeCsvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

/** Build a CSV document with a metadata preamble (generated time + applied filters). */
export function buildCsvDocument(
  header: string[],
  dataRows: unknown[][],
  meta: { generatedAt?: Date; filters?: Record<string, unknown> } = {},
): string {
  const preamble: unknown[][] = [
    ['Generated at', (meta.generatedAt ?? new Date()).toISOString()],
  ];
  if (meta.filters) {
    const applied = Object.entries(meta.filters)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${String(v)}`)
      .join('; ');
    preamble.push(['Filters', applied || 'none']);
  }
  preamble.push([]); // blank separator row
  return toCsv([...preamble, header, ...dataRows]);
}
