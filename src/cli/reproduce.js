// Usage: npm run reproduce -- --profile <starter|full> [--data data] [--config path]

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { compareManifests, sameEnvironment } from '../export/manifest-compare.js';
import { DATABASE_FILE, exportDataset } from '../export/write-dataset.js';
import { CONFIG_PATH, loadConfig } from '../generator/config.js';

function markdown(report) {
  const rows = report.files.map(
    (f) =>
      `| \`${f.path}\` | ${f.rows ?? '—'} | ${f.bytes.toLocaleString('en-US')} | \`${f.sha256.slice(0, 16)}…\` |`,
  );
  const published = report.published;
  return `# Reproducibility — profile \`${report.profile}\`, seed ${report.seed}

**Result: ${report.identical ? '✅ identical' : '❌ differences found'}**

Produced by \`${report.command}\`. The generator ran twice from scratch with the same seed and
configuration (config SHA-256 \`${report.config_sha256.slice(0, 16)}…\`) into separate folders;
every output file was compared by row count, size and SHA-256.

| Comparison | Files | Differences |
| --- | --- | --- |
| Run A vs run B | ${report.files.length} | ${report.run_differences.length} |
| Run A vs published \`manifest.json\` | ${published.present ? report.files.length : '—'} | ${published.present ? published.differences.length : 'no published manifest'} |

${published.present && !published.same_environment ? `The published manifest was produced with Node ${published.environment.node} / SQLite ${published.environment.sqlite}; this run used Node ${report.environment.node} / SQLite ${report.environment.sqlite}. Only \`${DATABASE_FILE}\` may differ between SQLite versions (its header records the version); every other file must match.\n\n` : ''}${[...report.run_differences, ...(published.differences ?? [])].map((d) => `- ${d}`).join('\n')}

## Files (run A)

| File | Rows | Bytes | SHA-256 |
| --- | --- | --- | --- |
${rows.join('\n')}
`;
}

function main() {
  const { values } = parseArgs({
    options: {
      profile: { type: 'string', default: 'starter' },
      data: { type: 'string', default: 'data' },
      config: { type: 'string', default: CONFIG_PATH },
    },
  });
  const config = loadConfig(values.config);
  const scratch = mkdtempSync(join(tmpdir(), 'yottashift-reproduce-'));
  const timings = [];
  try {
    const runs = ['a', 'b'].map((name) => {
      const started = performance.now();
      const { manifest } = exportDataset({
        config,
        profileName: values.profile,
        outDir: join(scratch, name),
      });
      timings.push(Math.round(performance.now() - started));
      return manifest;
    });
    const [a, b] = runs;
    const runDifferences = compareManifests(a, b);

    const publishedPath = join(values.data, values.profile, 'manifest.json');
    const published = { present: existsSync(publishedPath) };
    if (published.present) {
      const manifest = JSON.parse(readFileSync(publishedPath, 'utf8'));
      published.environment = manifest.environment;
      published.same_environment = sameEnvironment(manifest, a);
      // A different SQLite version writes a different database header; nothing else may change.
      published.differences = compareManifests(a, manifest).filter(
        (d) => published.same_environment || !d.startsWith(`${DATABASE_FILE}:`),
      );
    }

    const report = {
      profile: values.profile,
      seed: config.seed,
      command: `npm run reproduce -- --profile ${values.profile}`,
      config_sha256: a.config_sha256,
      environment: a.environment,
      runs: 2,
      identical: runDifferences.length === 0 && (published.differences ?? []).length === 0,
      run_differences: runDifferences,
      published,
      files: a.files,
    };
    const reportDir = join(values.data, values.profile, 'reports');
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'reproducibility.json'), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(reportDir, 'reproducibility.md'), markdown(report));

    console.log(`YottaShift reproducibility — profile "${values.profile}", seed ${config.seed}`);
    console.log(`Two runs: ${timings.join(' ms and ')} ms; ${a.files.length} files compared`);
    console.log(`Run A vs run B: ${runDifferences.length} difference(s)`);
    console.log(
      published.present
        ? `Run A vs published manifest: ${published.differences.length} difference(s)${published.same_environment ? '' : ' (different SQLite/Node version: database file excluded)'}`
        : 'No published manifest to compare with',
    );
    for (const d of [...runDifferences, ...(published.differences ?? [])].slice(0, 10))
      console.log(`  ✗ ${d}`);
    console.log(`${report.identical ? 'IDENTICAL' : 'DIFFERENT'} — report in ${reportDir}`);
    if (!report.identical) process.exitCode = 1;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(`Reproducibility check failed to run: ${error.message}`);
  process.exitCode = 2;
}
