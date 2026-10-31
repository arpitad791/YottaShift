// Local wall-clock time is handled as if it were UTC internally, which is exact because
// the offset never changes; the offset is only appended when formatting.

import { TIMEZONE } from '../domain/constants.js';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2})$/;

function dateToMs(date) {
  const match = DATE_RE.exec(date);
  if (!match) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`);
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (msToDate(ms) !== date) throw new RangeError(`Not a real calendar date: ${date}`);
  return ms;
}

function msToDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date, days) {
  return msToDate(dateToMs(date) + days * DAY_MS);
}

export function daysBetween(from, to) {
  return Math.round((dateToMs(to) - dateToMs(from)) / DAY_MS);
}

export function dateRange(start, count) {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export function isoWeekday(date) {
  return new Date(dateToMs(date)).getUTCDay() || 7;
}

export function isWeekend(date) {
  return isoWeekday(date) >= 6;
}

export function isoWeek(date) {
  const thursday = addDays(date, 4 - isoWeekday(date));
  const year = thursday.slice(0, 4);
  const week = Math.floor(daysBetween(`${year}-01-01`, thursday) / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function nextIsoWeekday(date, weekday) {
  return addDays(date, (weekday - isoWeekday(date) + 7) % 7);
}

export function toTimestamp(date, time) {
  dateToMs(date);
  const full = time.length === 5 ? `${time}:00` : time;
  if (!/^\d{2}:\d{2}:\d{2}$/.test(full) || full >= '24:00:00') {
    throw new RangeError(`Not an HH:MM[:SS] time: ${time}`);
  }
  return `${date}T${full}${TIMEZONE.offset}`;
}

export function timestampMs(timestamp) {
  return timestampToMs(timestamp);
}

export function timestampFromMs(ms) {
  return msToTimestamp(ms);
}

export function dateMs(date) {
  return dateToMs(date);
}

function timestampToMs(timestamp) {
  const match = TIMESTAMP_RE.exec(timestamp);
  if (!match || match[5] !== TIMEZONE.offset) {
    throw new RangeError(`Not a ${TIMEZONE.offset} timestamp: ${timestamp}`);
  }
  const [, date, hh, mm, ss] = match;
  if (Number(hh) > 23 || Number(mm) > 59 || Number(ss) > 59) {
    throw new RangeError(`Not a valid time of day: ${timestamp}`);
  }
  return dateToMs(date) + ((Number(hh) * 60 + Number(mm)) * 60 + Number(ss)) * 1000;
}

function msToTimestamp(ms) {
  return `${new Date(ms).toISOString().slice(0, 19)}${TIMEZONE.offset}`;
}

export function addMinutes(timestamp, minutes) {
  return msToTimestamp(timestampToMs(timestamp) + minutes * MINUTE_MS);
}

export function addSeconds(timestamp, seconds) {
  return msToTimestamp(timestampToMs(timestamp) + seconds * 1000);
}

export function minutesBetween(from, to) {
  return Math.floor((timestampToMs(to) - timestampToMs(from)) / MINUTE_MS);
}

export function timestampDate(timestamp) {
  timestampToMs(timestamp);
  return timestamp.slice(0, 10);
}

export function compactTimestamp(timestamp) {
  timestampToMs(timestamp);
  return timestamp.slice(0, 19).replace(/[-:]/g, '');
}

/** Minutes between two HH:MM times, wrapping past midnight (22:00 → 06:00 = 480). */
export function clockMinutes(start, end) {
  const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return (toMinutes(end) - toMinutes(start) + 1440) % 1440 || 1440;
}
