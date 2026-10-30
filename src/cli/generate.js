// Usage: npm run generate -- --profile <starter|full> [--out data] [--config path]
//
// Generates the dataset for a profile, loads it into an in-memory copy of the schema (so any
// constraint violation stops the run before files are written), writes one CSV per table to
// <out>/<profile>/csv/, the labels to <out>/<profile>/ground_truth/ (kept apart from the inputs)
// and the metrics to <out>/<profile>/reports/.

import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { createDatabase, loadTables } from '../db/database.js';
import { computeMetrics } from '../derive/metrics.js';
import { writeCsvTables } from '../export/csv-export.js';
import { writeGroundTruth } from '../export/ground-truth.js';
import { writeMetrics } from '../export/reports.js';
import { CONFIG_PATH, loadConfig } from '../generator/config.js';
import { generateDataset } from '../generator/index.js';

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
  const { tables, window, stats, groundTruth } = generateDataset(config, values.profile);

  const db = createDatabase();
  loadTables(db, tables);
  const fkProblems = db.prepare('PRAGMA foreign_key_check').all();
  if (fkProblems.length > 0) {
    throw new Error(`Foreign key violations: ${JSON.stringify(fkProblems.slice(0, 5))}`);
  }

  const dir = join(values.out, values.profile, 'csv');
  const written = writeCsvTables(db, dir, tables);
  db.close();

  const groundTruthDir = join(values.out, values.profile, 'ground_truth');
  writeGroundTruth(groundTruthDir, groundTruth);

  const metrics = computeMetrics(Object.fromEntries(tables), {
    patterns: config.operatingPatterns,
    window,
  });
  const reportDir = join(values.out, values.profile, 'reports');
  writeMetrics(reportDir, metrics, { profileName: values.profile, seed: config.seed });

  console.log(`YottaShift generator — profile "${values.profile}", seed ${config.seed}`);
  console.log(`Window ${window.startDate} → ${window.endDate} (${window.days} days)`);
  console.table(Object.fromEntries(written.map(({ table, rows }) => [table, { rows }])));
  console.log(
    `Backfilled shifts: ${stats.backfilled}; swap requests not placed: ${stats.swapShortfall}; approved swaps not applied: ${stats.unappliedApprovals}`,
  );
  const labels = Object.groupBy(groundTruth, (g) => g.label_class);
  console.log(
    `Ground truth: ${labels.ANOMALY?.length ?? 0} anomalies, ${labels.BOUNDARY?.length ?? 0} boundary cases → ${groundTruthDir}`,
  );
  console.log(
    `Coverage filled ${(metrics.M01_coverage_fill.fill_rate * 100).toFixed(2)} %, ${metrics.M02_gaps.gap_slots} short slots, ${metrics.M03_overtime.cap_breaches} overtime cap breaches`,
  );
  console.log(
    `Wrote ${written.length} CSV files to ${dir} and metrics to ${reportDir} in ${Math.round(performance.now() - started)} ms`,
  );
}

try {
  main();
} catch (error) {
  console.error(`Generation failed: ${error.message}`);
  process.exitCode = 1;
}
