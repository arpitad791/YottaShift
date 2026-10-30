import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export const SCHEMA_PATH = fileURLToPath(new URL('../../sql/schema.sql', import.meta.url));

/**
 * Parent-first load order for all 21 tables. Immediate FKs need their parent rows first; the
 * two cycles (team ↔ employee, shift_assignment ↔ swap_request) use deferred FKs.
 */
export const LOAD_ORDER = Object.freeze([
  'labor_policy',
  'skill',
  'team',
  'employee',
  'employee_skill',
  'leave_entitlement',
  'shift_template',
  'holiday_calendar',
  'shift',
  'coverage_requirement',
  'leave_request',
  'leave_request_event',
  'shift_assignment',
  'swap_request',
  'swap_request_event',
  'shift_assignment_event',
  'attendance_event',
  'employee_week_summary',
  'coverage_status',
  'leave_balance',
  'attendance_reconciliation',
]);

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

/** Map of every table in LOAD_ORDER → its column names in schema order. */
export function schemaColumns() {
  const db = createDatabase();
  const columns = new Map(LOAD_ORDER.map((table) => [table, tableColumns(db, table)]));
  db.close();
  return columns;
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
      const expected = tableColumns(db, table);
      rows.forEach((row, i) => {
        if (
          Object.keys(row).length !== expected.length ||
          !expected.every((column) => column in row)
        ) {
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
