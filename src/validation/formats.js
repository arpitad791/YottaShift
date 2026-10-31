import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { createDatabase, schemaColumns } from '../db/database.js';

function digest(rows, columns) {
  const hash = createHash('sha256');
  for (const row of rows)
    hash.update(`${columns.map((c) => JSON.stringify(row[c] ?? null)).join(',')}\n`);
  return hash.digest('hex');
}

const readAll = (db, table, columns) =>
  db.prepare(`SELECT ${columns.join(', ')} FROM ${table} ORDER BY rowid`).all();

export function checkFormats(dir, tables) {
  const result = {
    id: 'I-13',
    name: 'JSON, SQL seed and SQLite database hold exactly the CSV data',
    checked: 0,
    failures: 0,
    samples: [],
  };
  const fail = (message) => {
    result.failures += 1;
    if (result.samples.length < 5) result.samples.push(message);
  };
  try {
    const columns = schemaColumns();
    const expected = new Map(
      [...columns].map(([table, cols]) => [table, digest(tables[table] ?? [], cols)]),
    );
    const compare = (format, table, rows) => {
      result.checked += 1;
      if (digest(rows, columns.get(table)) !== expected.get(table))
        fail(`${format}: ${table} differs from ${table}.csv`);
    };

    const jsonDir = join(dir, 'json');
    if (!existsSync(jsonDir)) fail('json/ folder is missing');
    else {
      for (const table of columns.keys()) {
        const file = join(jsonDir, `${table}.json`);
        if (existsSync(file)) compare('json', table, JSON.parse(readFileSync(file, 'utf8')));
        else fail(`json/${table}.json is missing`);
      }
    }

    const seedFile = join(dir, 'sql', 'seed.sql');
    if (!existsSync(seedFile)) fail('sql/seed.sql is missing');
    else {
      const db = createDatabase();
      db.exec(readFileSync(seedFile, 'utf8'));
      for (const [table, cols] of columns) compare('sql/seed.sql', table, readAll(db, table, cols));
      db.close();
    }

    const databaseFile = join(dir, 'sqlite', 'yottashift.db');
    if (!existsSync(databaseFile)) fail('sqlite/yottashift.db is missing');
    else {
      const db = new DatabaseSync(databaseFile, { readOnly: true });
      for (const [table, cols] of columns) compare('sqlite', table, readAll(db, table, cols));
      db.close();
    }
  } catch (error) {
    fail(`check could not run on this data: ${error.message}`);
  }
  return result;
}
