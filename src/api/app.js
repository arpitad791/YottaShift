// Express application over one generated dataset. Everything is mounted under /api; errors use
// one shape: { error: { code, message, details? } }.

import express from 'express';

import { HttpError } from './http.js';
import { catalogRoutes } from './routes/catalog.js';
import { exceptionRoutes } from './routes/exceptions.js';
import { requestRoutes } from './routes/requests.js';
import { rosterRoutes } from './routes/roster.js';

export function createApp(store) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  const api = express.Router();
  api.use(catalogRoutes(store));
  api.use(rosterRoutes(store));
  api.use(requestRoutes(store));
  api.use(exceptionRoutes(store));
  api.use((req) => {
    throw new HttpError(404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`);
  });
  app.use('/api', api);

  // Express 5 forwards thrown errors here, including invalid JSON bodies from express.json().
  app.use((error, _req, res, _next) => {
    if (error instanceof HttpError) {
      res
        .status(error.status)
        .json({ error: { code: error.code, message: error.message, details: error.details } });
    } else if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
      res.status(error.status ?? 400).json({
        error: { code: 'BAD_REQUEST', message: 'Request body must be valid JSON under 10 kB' },
      });
    } else {
      console.error(error);
      res.status(500).json({ error: { code: 'INTERNAL', message: 'Unexpected server error' } });
    }
  });
  return app;
}
