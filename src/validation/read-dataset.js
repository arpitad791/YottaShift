import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createDatabase, LOAD_ORDER, tableColumns } from '../db/database.js';

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function schemaTypes() {
  const db = createDatabase();
  const tables = [...LOAD_ORDER];
  const types = new Map(
    tables.map((table) => [
      table,
      new Map(
        db
          .prepare('SELECT name, type FROM pragma_table_info(?)')
          .all(table)
          .map((c) => [c.name, c.type]),
      ),
    ]),
  );
  const columns = new Map(tables.map((t) => [t, tableColumns(db, t)]));
  db.close();
  return { tables, types, columns };
}

const convert = (value, type) => {
  if (value === '') return null;
  if (type === 'INTEGER' || type === 'REAL') {
    const n = Number(value);
    return Number.isFinite(n) ? n : value; // left as text so the type check can report it
  }
  return value;
};

export function readDataset(dir) {
  const { tables: names, types, columns } = schemaTypes();
  const tables = {};
  const layoutProblems = [];
  for (const name of names) {
    const file = join(dir, 'csv', `${name}.csv`);
    if (!existsSync(file)) {
      layoutProblems.push(`${name}.csv is missing`);
      continue;
    }
    const [header, ...records] = parseCsv(readFileSync(file, 'utf8'));
    const expected = columns.get(name);
    if (header.join(',') !== expected.join(',')) {
      layoutProblems.push(`${name}.csv header does not match the schema columns`);
      continue;
    }
    const tableTypes = types.get(name);
    tables[name] = records.map((values, line) => {
      if (values.length !== header.length)
        layoutProblems.push(`${name}.csv line ${line + 2}: ${values.length} fields`);
      return Object.fromEntries(
        header.map((column, i) => [column, convert(values[i] ?? '', tableTypes.get(column))]),
      );
    });
  }

  let groundTruth = [];
  const truthFile = join(dir, 'ground_truth', 'ground_truth.csv');
  if (existsSync(truthFile)) {
    const [header, ...records] = parseCsv(readFileSync(truthFile, 'utf8'));
    groundTruth = records.map((values) =>
      Object.fromEntries(
        header.map((c, i) => [c, c === 'expected_detection' ? Number(values[i]) : values[i]]),
      ),
    );
  } else {
    layoutProblems.push('ground_truth/ground_truth.csv is missing');
  }
  return { tables, layoutProblems, groundTruth };
}
