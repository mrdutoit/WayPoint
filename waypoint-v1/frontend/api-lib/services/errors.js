/**
 * Shared typed errors for the Module 2 service layer (objectiveService.js,
 * keyResultService.js, cascadeLevelService.js, cycleService.js,
 * scoringRubricService.js). api-lib/middleware/errorResponse.js switches
 * on `err.name` to pick an HTTP status — every validation/authorisation/
 * not-found throw in these services must use one of these classes (or a
 * domain-specific subclass with its own `name`, like
 * CascadeLevelInUseError or CycleNotFoundError) rather than a plain
 * `Error`, or it silently falls through to a generic 500 instead of the
 * correct 400/403/404.
 */

export class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; }
}
export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') { super(message); this.name = 'ForbiddenError'; }
}
export class NotFoundError extends Error {
  constructor(message = 'Not found') { super(message); this.name = 'NotFoundError'; }
}
