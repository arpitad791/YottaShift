import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { tableColumns } from '../db/database.js';
import { toCsv } from '../lib/csv.js';

/**
 * Writes one <table>.csv per table into `dir`, columns in schema order. The folder is
 * recreated first so files from an earlier run can never mix with this one.
 */
export function writeCsvTables(db, dir, tables) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const written = [];
  for (const [table, rows] of tables) {
    const file = join(dir, `${table}.csv`);
    writeFileSync(file, toCsv(tableColumns(db, table), rows));
    written.push({ table, file, rows: rows.length });
  }
  return written;
}
