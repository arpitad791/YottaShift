// Usage: npm run validate -- --profile <starter|full> [--data data] [--config path]
//
// Validates an exported dataset from its files alone: <data>/<profile>/csv/*.csv and
// <data>/<profile>/ground_truth/. Writes <data>/<profile>/reports/validation_summary.{json,md}
// and exits with code 1 when anything is wrong.

import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { writeValidation } from '../export/validation-report.js';
import { CONFIG_PATH, loadConfig } from '../generator/config.js';
import { readDataset } from '../validation/read-dataset.js';
import { validateDataset } from '../validation/validate.js';

function main() {
  const { values } = parseArgs({
    options: {
      profile: { type: 'string', default: 'starter' },
      data: { type: 'string', default: 'data' },
      config: { type: 'string', default: CONFIG_PATH },
    },
  });

  const started = performance.now();
  const config = loadConfig(values.config);
  const dir = join(values.data, values.profile);
  const summary = validateDataset(readDataset(dir), { patterns: config.operatingPatterns });
  const reportDir = join(dir, 'reports');
  writeValidation(reportDir, summary, { profileName: values.profile, seed: config.seed });

  console.log(`YottaShift validation — ${dir}`);
  console.table(
    Object.fromEntries(
      [...summary.integrity, ...summary.decisions].map((c) => [
        c.id,
        { checked: c.checked, failures: c.failures },
      ]),
    ),
  );
  if (summary.evaluation) {
    const { overall, boundary, secondary_findings: secondary } = summary.evaluation;
    console.log(
      `Detection: ${overall.detected}/${overall.anomaly_labels} anomalies (recall ${overall.recall}, precision ${overall.precision}); ` +
        `boundary flagged ${boundary.flagged}/${boundary.labels}; unexplained findings ${secondary.unexplained}`,
    );
    console.log(
      `Acceptance: ${summary.acceptance.map((a) => `${a.id} ${a.passed ? 'met' : 'NOT MET'}`).join(', ')}`,
    );
  }
  for (const problem of summary.problems) console.log(`  ✗ ${problem}`);
  console.log(
    `Status ${summary.status} — report in ${reportDir} (${Math.round(performance.now() - started)} ms)`,
  );
  if (summary.status !== 'PASS') process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(`Validation failed to run: ${error.message}`);
  process.exitCode = 2;
}
