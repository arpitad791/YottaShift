/**
 * Splits an integer `total` across buckets in proportion to `weights` (largest-remainder
 * method), after first giving each bucket its minimum. The result always sums to `total`;
 * ties on the remainder go to the lower index, so the split is deterministic.
 */
export function allocate(total, weights, minimums = weights.map(() => 0)) {
  const floor = minimums.reduce((sum, m) => sum + m, 0);
  if (!Number.isInteger(total) || total < floor) {
    throw new RangeError(`Cannot allocate ${total}: the minimums alone need ${floor}`);
  }
  const weightTotal = weights.reduce((sum, w) => sum + w, 0);
  if (!(weightTotal > 0)) throw new RangeError('allocate() needs a positive total weight');

  const rest = total - floor;
  const raw = weights.map((w) => (rest * w) / weightTotal);
  const result = raw.map((value, i) => minimums[i] + Math.floor(value));
  let leftover = total - result.reduce((sum, n) => sum + n, 0);
  const order = raw
    .map((value, i) => ({ i, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  for (const { i } of order) {
    if (leftover === 0) break;
    result[i] += 1;
    leftover -= 1;
  }
  return result;
}
