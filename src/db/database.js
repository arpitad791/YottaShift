import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export const SCHEMA_PATH = fileURLToPath(new URL('../../sql/schema.sql', import.meta.url));

export function readSchema() {
  return readFileSync(SCHEMA_PATH, 'utf8');
}

/** Opens a database (in memory by default) with foreign keys on and the schema applied. */
export function createDatabase(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(readSchema());
  return db;
}

/** Inserts plain-object rows; column order comes from the first row. */
export function insertRows(db, table, rows) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const statement = db.prepare(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
  );
  for (const row of rows) statement.run(...columns.map((column) => row[column]));
}
