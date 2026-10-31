import { ID_PATTERNS } from '../domain/constants.js';
import { compactTimestamp } from './dates.js';

function pad(value, width) {
  if (!Number.isInteger(value) || value < 1 || String(value).length > width) {
    throw new RangeError(`Counter ${value} does not fit ${width} digits`);
  }
  return String(value).padStart(width, '0');
}

function checked(kind, id) {
  if (!ID_PATTERNS[kind].test(id)) throw new RangeError(`Invalid ${kind} ID: ${id}`);
  return id;
}

export const ids = Object.freeze({
  employee: (n) => checked('employee', `EMP-${pad(n, 6)}`),
  shift: (date, templateCode) => checked('shift', `SHIFT-${date}-${templateCode}`),
  leaveRequest: (year, n) => checked('leaveRequest', `LVE-${year}-${pad(n, 6)}`),
  attendanceEvent: (employeeId, timestamp) =>
    checked('attendanceEvent', `ATT-${employeeId}-${compactTimestamp(timestamp)}`),
  swapRequest: (year, n) => checked('swapRequest', `SWP-${year}-${pad(n, 6)}`),
  team: (n) => checked('team', `TEAM-${pad(n, 3)}`),
  skill: (n) => checked('skill', `SKL-${pad(n, 3)}`),
  laborPolicy: (code, year) => checked('laborPolicy', `POL-${code}-${year}`),
  holiday: (date) => checked('holiday', `HOL-${date}`),
  coverageRequirement: (n) => checked('coverageRequirement', `COV-${pad(n, 6)}`),
  assignment: (year, n) => checked('assignment', `ASG-${year}-${pad(n, 6)}`),
  lifecycleEvent: (parentId, seq) => checked('lifecycleEvent', `${parentId}-E${pad(seq, 2)}`),
  groundTruth: (n) => checked('groundTruth', `GT-${pad(n, 6)}`),
});

export function createCounter() {
  const counts = new Map();
  return (key = '') => {
    const value = (counts.get(key) ?? 0) + 1;
    counts.set(key, value);
    return value;
  };
}
