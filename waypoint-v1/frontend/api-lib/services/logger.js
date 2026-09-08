import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      'password', '*.password', 'passwordHash', '*.passwordHash',
      'token', '*.token', 'req.headers.authorization',
      'resetTokenHash', '*.resetTokenHash',
      'comment', '*.comment', // Check-in/Reflection free text may carry sensitive commentary
    ],
    censor: '[REDACTED]',
  },
});

export function requestLogger(correlationId, extra = {}) {
  return logger.child({ correlationId, ...extra });
}
