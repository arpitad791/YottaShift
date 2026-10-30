// RFC 4180 CSV with LF line endings (stable checksums across platforms). null → empty field.

function field(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(columns, rows) {
  const lines = [columns.map(field).join(',')];
  for (const row of rows) lines.push(columns.map((column) => field(row[column])).join(','));
  return `${lines.join('\n')}\n`;
}
