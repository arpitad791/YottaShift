// Usage: npm run generate -- --profile <starter|full> [--out data] [--config path]
//
// Generates the dataset for a profile, loads it into an in-memory copy of the schema (so any
// constraint violation stops the run before files are written) and writes CSVs to
// <out>/<profile>/csv/.

import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { createDatabase, loadTables } from '../db/database.js';
import { writeCsvTables } from '../export/csv-export.js';
import { CONFIG_PATH, loadConfig } from '../generator/config.js';
import { generateMasterData } from '../generator/master/index.js';

function main() {
  const { values } = parseArgs({
    options: {
      profile: { type: 'string', default: 'starter' },
      out: { type: 'string', default: 'data' },
      config: { type: 'string', default: CONFIG_PATH },
    },
  });

  const started = performance.now();
  const config = loadConfig(values.config);
  const { tables, window } = generateMasterData(config, values.profile);

  const db = createDatabase();
  loadTables(db, tables);
  const fkProblems = db.prepare('PRAGMA foreign_key_check').all();
  if (fkProblems.length > 0)
    throw new Error(`Foreign key violations: ${JSON.stringify(fkProblems.slice(0, 5))}`);

  const dir = join(values.out, values.profile, 'csv');
  const written = writeCsvTables(db, dir, tables);
  db.close();

  console.log(`YottaShift generator — profile "${values.profile}", seed ${config.seed}`);
  console.log(`Window ${window.startDate} → ${window.endDate} (${window.days} days)`);
  console.table(Object.fromEntries(written.map(({ table, rows }) => [table, { rows }])));
  console.log(
    `Wrote ${written.length} CSV files to ${dir} in ${Math.round(performance.now() - started)} ms`,
  );
}

try {
  main();
} catch (error) {
  console.error(`Generation failed: ${error.message}`);
  process.exitCode = 1;
}
