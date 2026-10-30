// Seeded pseudo-random numbers. sfc32 is fast, has a 128-bit state and passes PractRand;
// its state is derived from "<seed>:<stream label>" with the cyrb128 string hash.
// Both are public-domain algorithms: sfc32 by Chris Doty-Humphrey (PractRand), cyrb128 by bryc.
//
// Each generator step forks its own named stream, so adding draws to one step never
// shifts the numbers another step receives. Same seed + same label = same sequence.

function cyrb128(text) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function sfc32(a, b, c, d) {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** Creates a deterministic random stream. All helpers draw from the same sequence. */
export function createRng(seed, label = 'root') {
  const next = sfc32(...cyrb128(`${seed}:${label}`));
  for (let i = 0; i < 15; i++) next(); // discard the first outputs, as recommended for sfc32

  const int = (min, max) => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`int(${min}, ${max}) needs integers with min <= max`);
    }
    return min + Math.floor(next() * (max - min + 1));
  };

  return {
    seed,
    label,
    next,
    int,
    float: (min, max) => min + next() * (max - min),
    chance: (probability) => next() < probability,
    pick(items) {
      if (items.length === 0) throw new RangeError('pick() from an empty list');
      return items[int(0, items.length - 1)];
    },
    /** entries: [[value, weight], ...] with non-negative weights. */
    weighted(entries) {
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      if (!(total > 0)) throw new RangeError('weighted() needs a positive total weight');
      let target = next() * total;
      for (const [value, weight] of entries) {
        target -= weight;
        if (target < 0) return value;
      }
      return entries.findLast(([, weight]) => weight > 0)[0];
    },
    shuffle(items) {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(0, i);
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
    /** Box–Muller; 1 - next() keeps the logarithm away from 0. */
    normal(mean = 0, sd = 1) {
      const u = 1 - next();
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    fork: (sublabel) => createRng(seed, `${label}/${sublabel}`),
  };
}
