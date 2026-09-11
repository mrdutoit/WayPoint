import { logger } from '../services/logger.js';

/**
 * Maps the typed errors thrown by the service layer (objectiveService.js,
 * keyResultService.js, cascadeLevelService.js, cycleService.js,
 * scoringRubricService.js) to an HTTP response, so every Module 2 router
 * handles them the same way instead of re-deriving the mapping per file.
 *
 * Anything not in the named list (a genuine bug, a DB error) is logged
 * and returned as a plain 500 rather than left to propagate out of the
 * handler unhandled — Vercel would still turn an uncaught throw into a
 * 500 at the platform level, but without our structured log entry or a
 * response body the frontend's ApiError can parse.
 */
export function respondToServiceError(res, err) {
  switch (err.name) {
    case 'ValidationError':
      return res.status(400).json({ error: err.message });
    case 'ForbiddenError':
      return res.status(403).json({ error: err.message });
    case 'NotFoundError':
      return res.status(404).json({ error: err.message });
    case 'CascadeLevelInUseError':
    case 'CadenceInUseError':
    case 'OverlappingCycleError':
      return res.status(409).json({ error: err.message });
    default:
      logger.error({ err }, 'Unhandled error in a Module 2 route');
      return res.status(500).json({ error: 'Internal server error' });
  }
}
