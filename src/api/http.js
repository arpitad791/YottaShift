import { ENUMS, ID_PATTERNS } from '../domain/constants.js';
import { addDays } from '../lib/dates.js';

export class HttpError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what, id) =>
  new HttpError(404, 'NOT_FOUND', `${what} ${id} does not exist`);
export const badRequest = (message, details) => new HttpError(400, 'BAD_REQUEST', message, details);

export function idParam(value, kind) {
  if (!ID_PATTERNS[kind].test(value)) throw badRequest(`"${value}" is not a valid ${kind} ID`);
  return value;
}

export function enumValue(value, enumName, name) {
  if (value === undefined || value === '') return undefined;
  if (!ENUMS[enumName].includes(value)) {
    throw badRequest(`${name} must be one of ${ENUMS[enumName].join(', ')}`);
  }
  return value;
}

export function dateValue(value, name) {
  if (value === undefined || value === '') return undefined;
  try {
    addDays(value, 0);
  } catch {
    throw badRequest(`${name} must be a real date in YYYY-MM-DD form`);
  }
  return value;
}

export function idValue(value, kind, name) {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !ID_PATTERNS[kind].test(value))
    throw badRequest(`${name} is not a valid ${kind} ID`);
  return value;
}

export const MAX_LIMIT = 500;

export function pagination(query) {
  const parse = (value, fallback, min, max, name) => {
    if (value === undefined) return fallback;
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max)
      throw badRequest(`${name} must be an integer from ${min} to ${max}`);
    return n;
  };
  return {
    limit: parse(query.limit, 50, 1, MAX_LIMIT, 'limit'),
    offset: parse(query.offset, 0, 0, Number.MAX_SAFE_INTEGER, 'offset'),
  };
}

/**
 * Builds "WHERE a = ? AND b = ?" from [sql, value] filters, skipping undefined values. An array
 * value fills several placeholders of one clause.
 */
export function where(filters) {
  const clauses = [];
  const params = [];
  for (const [sql, value] of filters) {
    if (value === undefined) continue;
    clauses.push(sql);
    params.push(...(Array.isArray(value) ? value : [value]));
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export function page(db, { from, select, filters, orderBy, query }) {
  const { limit, offset } = pagination(query);
  const w = where(filters);
  const total = db.prepare(`SELECT count(*) AS n FROM ${from} ${w.sql}`).get(...w.params).n;
  const data = db
    .prepare(`SELECT ${select} FROM ${from} ${w.sql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...w.params, limit, offset);
  return { data, page: { limit, offset, total } };
}
