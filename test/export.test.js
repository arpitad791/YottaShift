import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { createDatabase, LOAD_ORDER } from '../src/db/database.js';
import { sha256File } from '../src/export/formats.js';
import { compareManifests } from '../src/export/manifest-compare.js';
import { exportDataset } from '../src/export/write-dataset.js';
import { loadConfig } from '../src/generator/config.js';
import { generateDataset } from '../src/generator/index.js';
import { readDataset } from '../src/validation/read-dataset.js';
import { validateDataset } from '../src/validation/validate.js';

const config = loadConfig();
const run = (script, args) =>
  execFileSync(process.execPath, [script, ...args], { stdio: 'pipe' }).toString();

describe('export pipeline (starter)', () => {
  let out;
  let exported;
  before(() => {
    out = mkdtempSync(join(tmpdir(), 'yottashift-export-'));
    exported = exportDataset({ config, profileName: 'starter', outDir: out });
  });
  after(() => rmSync(out, { recursive: true, force: true }));
  const dir = () => join(out, 'starter');

  it('writes every table as CSV and JSON, plus the SQL seed, database, ground truth and metrics', () => {
    const paths = exported.manifest.files.map((f) => f.path);
    for (const table of LOAD_ORDER) {
      assert.ok(paths.includes(`csv/${table}.csv`), table);
      assert.ok(paths.includes(`json/${table}.json`), table);
    }
    for (const path of [
      'sql/seed.sql',
      'sqlite/yottashift.db',
      'ground_truth/ground_truth.csv',
      'ground_truth/ground_truth.json',
      'reports/metrics.json',
      'reports/metrics.md',
    ]) {
      assert.ok(paths.includes(path), path);
    }
    assert.equal(paths.length, LOAD_ORDER.length * 2 + 6);
  });

  it('records the true row count, size and SHA-256 of every file', () => {
    const tables = Object.fromEntries(generateDataset(config, 'starter').tables);
    for (const file of exported.manifest.files) {
      assert.equal(sha256File(join(dir(), file.path)), file.sha256, file.path);
      if (file.table) assert.equal(file.rows, tables[file.table].length, file.path);
    }
    assert.deepEqual(
      JSON.parse(readFileSync(join(dir(), 'manifest.json'), 'utf8')),
      exported.manifest,
    );
  });

  it('documents command, seed, generator, config, provenance and policy, without timestamps', () => {
    const m = exported.manifest;
    assert.equal(m.seed, 20261022);
    assert.equal(m.command, 'npm run generate -- --profile starter');
    assert.match(m.config_sha256, /^[0-9a-f]{64}$/);
    assert.equal(m.generator.name, 'yottashift');
    assert.equal(m.provenance.external_data, 'none');
    assert.ok(m.policy.leave && m.policy.swap);
    assert.deepEqual(m.ground_truth, {
      anomalies: 15,
      boundary_cases: 6,
      by_issue_type: m.ground_truth.by_issue_type,
    });
    // The only timestamp is the dataset's own snapshot, never the time of the run.
    const text = JSON.stringify(m);
    assert.equal(
      text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/g).join(),
      m.window.snapshot_at.slice(0, 16),
    );
  });

  it('builds a database file that opens cleanly with every row and foreign key in place', () => {
    const db = new DatabaseSync(join(dir(), 'sqlite', 'yottashift.db'), { readOnly: true });
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    db.exec('PRAGMA foreign_keys = ON');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    for (const table of LOAD_ORDER) {
      assert.equal(
        db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,
        exported.manifest.tables[table],
        table,
      );
    }
    db.close();
  });

  it('writes a seed that loads into a fresh schema with foreign keys on', () => {
    const db = createDatabase();
    db.exec(readFileSync(join(dir(), 'sql', 'seed.sql'), 'utf8'));
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    for (const table of LOAD_ORDER) {
      assert.equal(
        db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,
        exported.manifest.tables[table],
        table,
      );
    }
    db.close();
  });

  it('passes validation including the format check, and fails it when one export is changed', () => {
    const validate = () =>
      validateDataset(readDataset(dir()), { patterns: config.operatingPatterns, dir: dir() });
    const good = validate();
    assert.equal(good.status, 'PASS', good.problems.join('\n'));
    const formats = good.integrity.find((c) => c.id === 'I-13');
    assert.equal(formats.checked, LOAD_ORDER.length * 3);
    assert.equal(formats.failures, 0);

    const jsonFile = join(dir(), 'json', 'team.json');
    const original = readFileSync(jsonFile, 'utf8');
    writeFileSync(jsonFile, original.replace('"BLR"', '"PUN"'));
    const bad = validate();
    writeFileSync(jsonFile, original);
    assert.equal(bad.status, 'FAIL');
    assert.match(bad.integrity.find((c) => c.id === 'I-13').samples.join(), /json: team differs/);
  });
});

describe('manifest comparison', () => {
  const manifest = {
    seed: 1,
    config_sha256: 'abc',
    files: [
      { path: 'csv/a.csv', rows: 2, bytes: 10, sha256: 'x' },
      { path: 'csv/b.csv', rows: 1, bytes: 5, sha256: 'y' },
    ],
  };
  it('finds no difference between identical manifests', () => {
    assert.deepEqual(compareManifests(manifest, structuredClone(manifest)), []);
  });
  it('reports changed checksums, missing files and a different seed', () => {
    const other = structuredClone(manifest);
    other.files[0].sha256 = 'z';
    other.files.pop();
    other.seed = 2;
    const differences = compareManifests(manifest, other);
    assert.ok(differences.some((d) => d.startsWith('csv/a.csv: sha256')));
    assert.ok(differences.some((d) => d.startsWith('csv/b.csv: missing')));
    assert.ok(differences.some((d) => d.startsWith('seed')));
  });
});

describe('reproduce CLI (starter)', () => {
  it('regenerates twice identically and matches the published manifest; exits 1 when it does not', () => {
    const data = mkdtempSync(join(tmpdir(), 'yottashift-reproduce-test-'));
    try {
      run('src/cli/generate.js', ['--profile', 'starter', '--out', data]);
      const output = run('src/cli/reproduce.js', ['--profile', 'starter', '--data', data]);
      assert.match(output, /IDENTICAL/);
      const report = JSON.parse(
        readFileSync(join(data, 'starter', 'reports', 'reproducibility.json'), 'utf8'),
      );
      assert.equal(report.identical, true);
      assert.equal(report.runs, 2);
      assert.equal(report.published.present, true);
      assert.deepEqual(report.published.differences, []);
      assert.equal(report.files.length, LOAD_ORDER.length * 2 + 6);

      const manifestFile = join(data, 'starter', 'manifest.json');
      const published = JSON.parse(readFileSync(manifestFile, 'utf8'));
      published.files.find((f) => f.path === 'csv/employee.csv').sha256 = '0'.repeat(64);
      writeFileSync(manifestFile, JSON.stringify(published));
      assert.throws(
        () => run('src/cli/reproduce.js', ['--profile', 'starter', '--data', data]),
        (error) => error.status === 1 && /csv\/employee\.csv: sha256/.test(error.stdout.toString()),
      );
    } finally {
      rmSync(data, { recursive: true, force: true });
    }
  });
});
