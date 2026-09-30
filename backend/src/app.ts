import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import helmet from 'helmet';
import { env } from './config/env';
import { authRouter } from './http/routes/auth';
import { customersRouter } from './http/routes/customers';
import { dashboardRouter, ordersRouter, searchRouter, statusRouter } from './http/routes/orders';
import { partsRouter } from './http/routes/parts';
import { photosRouter } from './http/routes/photos';
import { settingsRouter, syncRouter } from './http/routes/settings';
import { suppliersRouter } from './http/routes/suppliers';
import { deviceLogsRouter } from './http/routes/deviceLogs';
import { errorHandler, notFound } from './http/middleware/respond';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    helmet({
      // The PWA is served from the same origin in production; Google Drive
      // previews are opened as normal links, never framed.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  app.use(
    cors({
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/api/health', (_req, res) => {
    res.json({ data: { ok: true, time: new Date().toISOString() } });
  });

  app.use('/api/auth', authRouter);
  app.use('/api', statusRouter);
  app.use('/api', ordersRouter);
  app.use('/api', customersRouter);
  app.use('/api', partsRouter);
  app.use('/api', suppliersRouter);
  app.use('/api', dashboardRouter);
  app.use('/api', searchRouter);
  app.use('/api', photosRouter);
  app.use('/api', settingsRouter);
  app.use('/api', syncRouter);
  app.use('/api', deviceLogsRouter);

  app.use('/api', notFound);

  // Serve the built PWA (single page app) when it exists.
  if (fs.existsSync(env.frontendDist)) {
    app.use(
      express.static(env.frontendDist, {
        index: false,
        setHeaders(res, filePath) {
          if (filePath.endsWith('sw.js') || filePath.endsWith('.webmanifest')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.join(env.frontendDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
