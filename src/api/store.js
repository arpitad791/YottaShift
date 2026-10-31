import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { readAllTables } from '../db/database.js';
import { RULES } from '../domain/rules.js';
import { DATABASE_FILE } from '../export/write-dataset.js';
import { timestampFromMs } from '../lib/dates.js';
import { checkBusinessRules } from '../validation/business-rules.js';

const IST_OFFSET_MS = 330 * 60_000;
export const REVIEW_STATUS = Object.freeze(['ACKNOWLEDGED', 'RESOLVED', 'DISMISSED']);

const REVIEWS_SCHEMA = `
CREATE TABLE IF NOT EXISTS exception_review (
  review_id         TEXT PRIMARY KEY CHECK (review_id GLOB 'REV-[0-9][0-9][0-9][0-9][0-9][0-9]'),
  finding_id        TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')),
  actor_employee_id TEXT NOT NULL,
  actor_role        TEXT NOT NULL,
  note              TEXT,
  reviewed_at       TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS idx_review_finding ON exception_review (finding_id);
`;

/** Stable ID of a finding: the same rule on the same records always gets the same ID. */
export function findingId(finding) {
  const key = `${finding.ruleId}|${finding.kind}|${finding.recordIds.join(';')}`;
  return `FND-${createHash('sha256').update(key).digest('hex').slice(0, 12)}`;
}

export class DatasetStore {
  constructor({ dataDir, profile, patterns }) {
    this.profile = profile;
    this.patterns = patterns;
    this.dir = join(dataDir, profile);
    const file = join(this.dir, DATABASE_FILE);
    if (!existsSync(file)) {
      throw new Error(`No dataset at ${file}. Run: npm run generate -- --profile ${profile}`);
    }
    this.db = new DatabaseSync(file, { readOnly: true });
    mkdirSync(join(this.dir, 'api'), { recursive: true });
    this.reviews = new DatabaseSync(join(this.dir, 'api', 'reviews.db'));
    this.reviews.exec(REVIEWS_SCHEMA);
    this.cache = {};
  }

  close() {
    this.db.close();
    this.reviews.close();
  }

  json(relativePath) {
    const file = join(this.dir, relativePath);
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  }

  tables() {
    this.cache.tables ??= readAllTables(this.db);
    return this.cache.tables;
  }

  groundTruth() {
    this.cache.groundTruth ??= this.json('ground_truth/ground_truth.json') ?? [];
    return this.cache.groundTruth;
  }

  findings() {
    if (!this.cache.findings) {
      const t = this.tables();
      const teamOf = new Map(t.employee.map((e) => [e.employee_id, e.team_id]));
      const labels = this.groundTruth().filter((l) => l.label_class === 'ANOMALY');
      this.cache.findings = checkBusinessRules(t, { patterns: this.patterns }).map((f) => {
        const label = labels.find((l) =>
          l.record_ids.split(';').some((id) => f.recordIds.includes(id)),
        );
        return {
          finding_id: findingId(f),
          rule_id: f.ruleId,
          rule: RULES[f.ruleId],
          issue_type: f.issueType,
          kind: f.kind,
          table: f.table,
          record_ids: f.recordIds,
          employee_id: f.employeeId,
          team_id: teamOf.get(f.employeeId) ?? null,
          reference_date: f.referenceDate,
          message: f.message,
          ground_truth_id: label ? label.ground_truth_id : null,
        };
      });
      this.cache.findingsById = new Map(this.cache.findings.map((f) => [f.finding_id, f]));
    }
    return this.cache.findings;
  }

  finding(id) {
    this.findings();
    return this.cache.findingsById.get(id) ?? null;
  }

  reviewsFor(id) {
    return this.reviews
      .prepare('SELECT * FROM exception_review WHERE finding_id = ? ORDER BY review_id')
      .all(id);
  }

  latestReviewStatuses() {
    const rows = this.reviews
      .prepare('SELECT finding_id, status FROM exception_review ORDER BY review_id')
      .all();
    return new Map(rows.map((r) => [r.finding_id, r.status]));
  }

  /** Appends a review; reviews are never updated or deleted. */
  addReview({ findingId: id, status, actorEmployeeId, actorRole, note }) {
    const { n } = this.reviews.prepare('SELECT count(*) AS n FROM exception_review').get();
    const review = {
      review_id: `REV-${String(n + 1).padStart(6, '0')}`,
      finding_id: id,
      status,
      actor_employee_id: actorEmployeeId,
      actor_role: actorRole,
      note: note ?? null,
      reviewed_at: timestampFromMs(Date.now() + IST_OFFSET_MS),
    };
    this.reviews
      .prepare(
        'INSERT INTO exception_review (review_id, finding_id, status, actor_employee_id, actor_role, note, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(...Object.values(review));
    return review;
  }
}
