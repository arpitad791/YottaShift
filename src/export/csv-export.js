import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { toCsv } from '../lib/csv.js';

/**
 * Writes one <table>.csv per table into `dir`, columns in schema order. The folder is
 * recreated first so files from an earlier run can never mix with this one.
 */
export function writeCsvTables(dir, tables, columnsOf) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [table, rows] of tables) {
    writeFileSync(join(dir, `${table}.csv`), toCsv(columnsOf(table), rows));
  }
}
