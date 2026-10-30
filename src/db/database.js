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

/** Column names of a table, in schema order. */
export function tableColumns(db, table) {
  return db
    .prepare(`SELECT name FROM pragma_table_info(?) ORDER BY cid`)
    .all(table)
    .map((row) => row.name);
}

/**
 * Loads [table, rows] pairs in one transaction (deferred FKs are checked at commit). Every row
 * must carry exactly the table's columns, so a generator bug cannot silently insert NULLs.
 */
export function loadTables(db, tables) {
  db.exec('BEGIN');
  try {
    for (const [table, rows] of tables) {
      const expected = [...tableColumns(db, table)].sort().join();
      rows.forEach((row, i) => {
        if (Object.keys(row).sort().join() !== expected) {
          throw new Error(`${table} row ${i}: columns do not match the schema`);
        }
      });
      try {
        insertRows(db, table, rows);
      } catch (error) {
        throw new Error(`${table}: ${error.message}`, { cause: error });
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
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
