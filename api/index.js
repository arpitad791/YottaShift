// Vercel entry point: the same Express app as `npm run api`, exported instead of listening.

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp } from '../src/api/app.js';
import { DatasetStore } from '../src/api/store.js';
import { loadConfig } from '../src/generator/config.js';

const root = fileURLToPath(new URL('..', import.meta.url));

const store = new DatasetStore({
  dataDir: join(root, 'data'),
  profile: process.env.YOTTASHIFT_PROFILE ?? 'full',
  patterns: loadConfig().operatingPatterns,
  // The deployment's files are read-only; /tmp is the only writable place, so reviews last
  // as long as the function instance does.
  reviewsDir: process.env.YOTTASHIFT_REVIEWS_DIR ?? '/tmp/yottashift',
});

export default createApp(store);
