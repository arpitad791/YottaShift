// Usage: npm run api -- [--profile starter] [--data data] [--port 3001]
//
// Serves the generated dataset of a profile over HTTP (read endpoints, exception reviews, leave
// what-if). The dataset files are opened read-only; reviews go to <data>/<profile>/api/reviews.db.

import { parseArgs } from 'node:util';

import { createApp } from '../api/app.js';
import { DatasetStore } from '../api/store.js';
import { CONFIG_PATH, loadConfig } from '../generator/config.js';

const { values } = parseArgs({
  options: {
    profile: { type: 'string', default: 'starter' },
    data: { type: 'string', default: 'data' },
    port: { type: 'string', default: '3001' },
    config: { type: 'string', default: CONFIG_PATH },
  },
});

try {
  const config = loadConfig(values.config);
  const store = new DatasetStore({
    dataDir: values.data,
    profile: values.profile,
    patterns: config.operatingPatterns,
  });
  const server = createApp(store).listen(Number(values.port), () => {
    console.log(
      `YottaShift API — profile "${values.profile}" on http://localhost:${server.address().port}/api`,
    );
    // Loading every table and running the detectors takes a few seconds at full scale; do it
    // now so the first /exceptions request is fast.
    setImmediate(() => {
      const started = performance.now();
      const findings = store.findings();
      console.log(
        `Exceptions ready: ${findings.length} findings (${Math.round(performance.now() - started)} ms)`,
      );
    });
  });
  const stop = () => server.close(() => store.close());
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch (error) {
  console.error(`API failed to start: ${error.message}`);
  process.exitCode = 1;
}
