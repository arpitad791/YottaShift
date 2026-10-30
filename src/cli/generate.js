// Usage: npm run generate -- --profile <starter|full> [--out data] [--config path]
//
// Generates the dataset for a profile and writes everything under <out>/<profile>/:
//   sqlite/yottashift.db (built first: every row must pass sql/schema.sql), csv/, json/,
//   sql/seed.sql, ground_truth/ (kept apart from the inputs), reports/metrics.{json,md}
//   and manifest.json (row counts + SHA-256 of every file).

import { parseArgs } from 'node:util';

import { exportDataset } from '../export/write-dataset.js';
import { CONFIG_PATH, loadConfig } from '../generator/config.js';

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
  const { dataset, metrics, manifest, dir } = exportDataset({
    config,
    profileName: values.profile,
    outDir: values.out,
  });
  const { window, stats, groundTruth } = dataset;

  console.log(`YottaShift generator — profile "${values.profile}", seed ${config.seed}`);
  console.log(`Window ${window.startDate} → ${window.endDate} (${window.days} days)`);
  console.table(
    Object.fromEntries(Object.entries(manifest.tables).map(([table, rows]) => [table, { rows }])),
  );
  console.log(
    `Backfilled shifts: ${stats.backfilled}; swap requests not placed: ${stats.swapShortfall}; approved swaps not applied: ${stats.unappliedApprovals}`,
  );
  const labels = Object.groupBy(groundTruth, (g) => g.label_class);
  console.log(
    `Ground truth: ${labels.ANOMALY?.length ?? 0} anomalies, ${labels.BOUNDARY?.length ?? 0} boundary cases`,
  );
  console.log(
    `Coverage filled ${(metrics.M01_coverage_fill.fill_rate * 100).toFixed(2)} %, ${metrics.M02_gaps.gap_slots} short slots, ${metrics.M03_overtime.cap_breaches} overtime cap breaches`,
  );
  const megabytes = manifest.files.reduce((sum, f) => sum + f.bytes, 0) / 1_048_576;
  console.log(
    `Wrote ${manifest.files.length} files (${megabytes.toFixed(1)} MB) + manifest.json to ${dir} in ${Math.round(performance.now() - started)} ms`,
  );
}

try {
  main();
} catch (error) {
  console.error(`Generation failed: ${error.message}`);
  process.exitCode = 1;
}
