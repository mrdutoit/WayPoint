import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { config } from './src/config.js';
import { requestLogger } from './src/services/logger.js';
import { requireAuth, requireRole } from './src/middleware/auth.js';
import { healthHandler } from './src/functions/health.js';
import { loginHandler, requestPasswordResetHandler, confirmPasswordResetHandler } from './src/functions/auth.js';
import { listFlagsHandler, updateFlagHandler } from './src/functions/flags.js';

const app = express();

app.use(cors({ origin: config.frontendOrigin }));
app.use(express.json());

// Correlation id per request (FR-006) — attached before anything else logs.
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || randomUUID();
  req.log = requestLogger(correlationId, { path: req.path, method: req.method });
  res.setHeader('x-correlation-id', correlationId);
  next();
});

// Public
app.get('/api/health', healthHandler);
app.post('/api/auth/login', loginHandler);
app.post('/api/auth/reset-password/request', requestPasswordResetHandler);
app.post('/api/auth/reset-password/confirm', confirmPasswordResetHandler);

// Authenticated
app.get('/api/flags', requireAuth, listFlagsHandler);
app.patch('/api/flags/:key', requireAuth, requireRole('PlatformAdmin'), updateFlagHandler);

// Centralised error handler — never leak a stack trace to the client.
app.use((err, req, res, _next) => {
  req.log?.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

// Local development only — Vercel invokes the exported app directly and
// never calls listen() itself.
if (process.env.VERCEL !== '1') {
  app.listen(config.port, () => {
    console.log(`Waypoint API listening on http://localhost:${config.port}`);
  });
}

export default app;
