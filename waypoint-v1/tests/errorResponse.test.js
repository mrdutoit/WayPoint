import { describe, it, expect, vi } from 'vitest';
import { respondToServiceError } from '../frontend/api-lib/middleware/errorResponse.js';
import { ValidationError, ForbiddenError, NotFoundError } from '../frontend/api-lib/services/objectiveService.js';
import { CascadeLevelInUseError } from '../frontend/api-lib/services/cascadeLevelService.js';
import { CadenceInUseError } from '../frontend/api-lib/services/cadenceService.js';
import { OverlappingCycleError } from '../frontend/api-lib/services/cycleService.js';

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('respondToServiceError', () => {
  it.each([
    [new ValidationError('bad input'), 400],
    [new ForbiddenError('nope'), 403],
    [new NotFoundError('gone'), 404],
    [new CascadeLevelInUseError(2), 409],
    [new CadenceInUseError(), 409],
    [new OverlappingCycleError(), 409],
  ])('maps %o to status %i', (err, expectedStatus) => {
    const res = mockRes();
    respondToServiceError(res, err);
    expect(res.status).toHaveBeenCalledWith(expectedStatus);
    expect(res.json).toHaveBeenCalledWith({ error: err.message });
  });

  it('maps an unrecognised error to a plain 500 rather than throwing', () => {
    const res = mockRes();
    expect(() => respondToServiceError(res, new Error('database exploded'))).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });
});
