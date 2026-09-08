import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.logLevel,
  // note: redaction is enforced centrally — never log these even by mistake
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

// Child logger per request — attach a correlation id so a single request
// can be traced end to end across every log line it produces.
export function requestLogger(correlationId, extra = {}) {
  return logger.child({ correlationId, ...extra });
}
