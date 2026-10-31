import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { toCsv } from '../lib/csv.js';

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

export function writeGroundTruth(dir, rows) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'ground_truth.csv'), toCsv(GROUND_TRUTH_COLUMNS, rows));
  writeFileSync(join(dir, 'ground_truth.json'), `${JSON.stringify(rows, null, 2)}\n`);
}
