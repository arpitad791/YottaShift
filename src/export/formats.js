// JSON, SQL seed and SQLite exports. Every format writes the same rows with the columns in
// schema order, so the four formats (with CSV) hold exactly the same data.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { createDatabase, loadTables } from '../db/database.js';

// Rows per INSERT statement: keeps seed.sql compact and fast to load.
const SEED_BATCH = 500;

/** One JSON array per table, one row object per line (diff- and stream-friendly). */
export function writeJsonTables(dir, tables, columnsOf) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [table, rows] of tables) {
    const columns = columnsOf(table);
    const lines = rows.map((row) =>
      JSON.stringify(Object.fromEntries(columns.map((c) => [c, row[c]]))),
    );
    writeFileSync(
      join(dir, `${table}.json`),
      lines.length === 0 ? '[]\n' : `[\n${lines.join(',\n')}\n]\n`,
    );
  }
}

const sqlLiteral = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
};

/** Data-only seed for sql/schema.sql, parent tables first, in one transaction. */
export function writeSqlSeed(file, tables, columnsOf, { profileName, seed }) {
  mkdirSync(dirname(file), { recursive: true });
  const parts = [
    `-- YottaShift seed data — profile "${profileName}", seed ${seed}.`,
    '-- Load into a database created from sql/schema.sql, e.g.:',
    '--   sqlite3 yottashift.db < sql/schema.sql && sqlite3 yottashift.db < seed.sql',
    '-- team ↔ employee and shift_assignment ↔ swap_request use deferred foreign keys,',
    '-- so the whole file runs as one transaction.',
    'PRAGMA foreign_keys = ON;',
    'BEGIN;',
  ];
  for (const [table, rows] of tables) {
    const columns = columnsOf(table);
    parts.push(`-- ${table}: ${rows.length} rows`);
    for (let i = 0; i < rows.length; i += SEED_BATCH) {
      const values = rows
        .slice(i, i + SEED_BATCH)
        .map((row) => `(${columns.map((c) => sqlLiteral(row[c])).join(', ')})`)
        .join(',\n');
      parts.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${values};`);
    }
  }
  parts.push('COMMIT;', '');
  writeFileSync(file, parts.join('\n'));
}

/**
 * Builds the SQLite database file from scratch: schema, then every row in one transaction.
 * Loading enforces the schema's types, CHECKs and FKs, so this is also the integrity gate.
 */
export function writeSqliteDatabase(file, tables) {
  mkdirSync(dirname(file), { recursive: true });
  rmSync(file, { force: true });
  const db = createDatabase(file);
  try {
    loadTables(db, tables);
    const problems = db.prepare('PRAGMA foreign_key_check').all();
    if (problems.length > 0)
      throw new Error(`Foreign key violations: ${JSON.stringify(problems.slice(0, 5))}`);
  } finally {
    db.close();
  }
}

export function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
