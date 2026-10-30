import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { allocate } from '../src/lib/allocate.js';
import { toCsv } from '../src/lib/csv.js';
import {
  addDays,
  addMinutes,
  clockMinutes,
  compactTimestamp,
  daysBetween,
  isoWeek,
  isoWeekday,
  minutesBetween,
  nextIsoWeekday,
  toTimestamp,
} from '../src/lib/dates.js';
import { createCounter, ids } from '../src/lib/ids.js';
import { createRng } from '../src/lib/rng.js';

const draws = (rng, n = 5) => Array.from({ length: n }, () => rng.next());

describe('rng', () => {
  it('repeats the same sequence for the same seed and label', () => {
    assert.deepEqual(draws(createRng(20261022, 'x')), draws(createRng(20261022, 'x')));
  });

  it('gives different sequences for a different seed or label', () => {
    const base = draws(createRng(20261022, 'x'));
    assert.notDeepEqual(base, draws(createRng(20261023, 'x')));
    assert.notDeepEqual(base, draws(createRng(20261022, 'y')));
  });

  it('keeps forked streams independent of draws on the parent', () => {
    const a = createRng(1);
    const b = createRng(1);
    draws(b, 100);
    assert.deepEqual(draws(a.fork('child')), draws(b.fork('child')));
  });

  it('keeps every helper inside its range', () => {
    const rng = createRng(7);
    for (let i = 0; i < 2000; i++) {
      const n = rng.next();
      assert.ok(n >= 0 && n < 1);
      const k = rng.int(3, 5);
      assert.ok(Number.isInteger(k) && k >= 3 && k <= 5);
    }
    const seen = new Set(Array.from({ length: 200 }, () => rng.int(1, 3)));
    assert.deepEqual([...seen].sort(), [1, 2, 3]);
    assert.throws(() => rng.int(5, 3), RangeError);
    assert.throws(() => rng.pick([]), RangeError);
  });

  it('respects weights, including zero weights', () => {
    const rng = createRng(11);
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 4000; i++) {
      counts[
        rng.weighted([
          ['a', 0.75],
          ['b', 0.25],
          ['c', 0],
        ])
      ] += 1;
    }
    assert.equal(counts.c, 0);
    assert.ok(Math.abs(counts.a / 4000 - 0.75) < 0.03, JSON.stringify(counts));
  });

  it('shuffles into a permutation without touching the input', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const output = createRng(3).shuffle(input);
    assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
    assert.deepEqual([...output].sort(), input);
  });
});

describe('dates', () => {
  it('computes ISO weeks, including year boundaries', () => {
    assert.equal(isoWeek('2026-01-01'), '2026-W01');
    assert.equal(isoWeek('2025-12-29'), '2026-W01');
    assert.equal(isoWeek('2026-01-05'), '2026-W02');
    assert.equal(isoWeek('2026-03-31'), '2026-W14');
    assert.equal(isoWeek('2027-01-01'), '2026-W53');
  });

  it('does calendar arithmetic and rejects impossible dates', () => {
    assert.equal(addDays('2026-02-28', 1), '2026-03-01');
    assert.equal(addDays('2026-01-01', -1), '2025-12-31');
    assert.equal(daysBetween('2026-01-01', '2026-03-31'), 89);
    assert.equal(isoWeekday('2026-01-01'), 4);
    assert.equal(nextIsoWeekday('2026-02-15', 1), '2026-02-16');
    assert.equal(nextIsoWeekday('2026-02-16', 1), '2026-02-16');
    assert.throws(() => addDays('2026-02-30', 0), RangeError);
  });

  it('handles timestamps across midnight in the fixed offset', () => {
    const start = toTimestamp('2026-01-31', '22:00');
    assert.equal(start, '2026-01-31T22:00:00+05:30');
    assert.equal(addMinutes(start, 480), '2026-02-01T06:00:00+05:30');
    assert.equal(minutesBetween(start, '2026-02-01T06:03:00+05:30'), 483);
    assert.equal(compactTimestamp('2026-01-01T05:58:07+05:30'), '20260101T055807');
    assert.throws(() => addMinutes('2026-01-01T06:00:00Z', 1), RangeError);
    assert.equal(clockMinutes('22:00', '06:00'), 480);
    assert.equal(clockMinutes('06:00', '14:00'), 480);
  });
});

describe('ids', () => {
  it('formats every ID kind and matches the brief examples', () => {
    assert.equal(ids.employee(1), 'EMP-000001');
    assert.equal(ids.shift('2026-01-01', 'A'), 'SHIFT-2026-01-01-A');
    assert.equal(ids.leaveRequest(2026, 1), 'LVE-2026-000001');
    assert.equal(
      ids.attendanceEvent('EMP-000001', '2026-01-01T05:58:00+05:30'),
      'ATT-EMP-000001-20260101T055800',
    );
    assert.equal(ids.swapRequest(2026, 1), 'SWP-2026-000001');
    assert.equal(ids.lifecycleEvent('LVE-2026-000001', 2), 'LVE-2026-000001-E02');
    assert.equal(ids.laborPolicy('FT', '2026'), 'POL-FT-2026');
  });

  it('refuses counters that do not fit or are not positive integers', () => {
    assert.throws(() => ids.team(1000), RangeError);
    assert.throws(() => ids.employee(0), RangeError);
    assert.throws(() => ids.employee(1.5), RangeError);
    assert.throws(() => ids.shift('2026-01-01', 'Z'), RangeError);
  });

  it('counts per key', () => {
    const next = createCounter();
    assert.deepEqual([next('2026'), next('2026'), next('2027'), next('2026')], [1, 2, 1, 3]);
  });
});

describe('allocate', () => {
  it('always sums to the total and honours minimums', () => {
    const result = allocate(100, [1, 2, 3, 4], [10, 10, 10, 10]);
    assert.equal(
      result.reduce((a, b) => a + b),
      100,
    );
    assert.ok(result.every((n) => n >= 10));
    assert.deepEqual(allocate(10, [1, 1, 1]), [4, 3, 3]);
  });

  it('fails when the minimums cannot fit', () => {
    assert.throws(() => allocate(5, [1, 1], [3, 3]), RangeError);
  });
});

describe('csv', () => {
  it('quotes only when needed and writes nulls as empty fields', () => {
    const csv = toCsv(['a', 'b', 'c'], [{ a: 'plain', b: 'x, "y"', c: null }]);
    assert.equal(csv, 'a,b,c\nplain,"x, ""y""",\n');
  });
});
