import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { toCsv } from '../lib/csv.js';

// Layout from docs/data-dictionary.md §10.
export const GROUND_TRUTH_COLUMNS = Object.freeze([
  'ground_truth_id',
  'label_class',
  'issue_type',
  'rule_id',
  'primary_table',
  'record_ids',
  'employee_id',
  'reference_date',
  'expected_detection',
  'description',
]);

/**
 * Writes ground_truth.csv and ground_truth.json into their own folder, away from the input
 * tables (Step 7 of the brief): nothing that reads data/<profile>/csv can see a label.
 */
export function writeGroundTruth(dir, rows) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'ground_truth.csv'), toCsv(GROUND_TRUTH_COLUMNS, rows));
  writeFileSync(join(dir, 'ground_truth.json'), `${JSON.stringify(rows, null, 2)}\n`);
}
