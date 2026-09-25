import { describe, it, expect } from 'vitest';
import { describeAction, entityName } from '../frontend/src/utils/auditText.js';

describe('auditText', () => {
  it('renders every recorded action code in plain English', () => {
    expect(describeAction('checkIn.created')).toBe('Checked in');
    expect(describeAction('objective.updated')).toBe('Updated an objective');
    expect(describeAction('keyResult.created')).toBe('Added a Key Result');
    expect(describeAction('user.invited')).toBe('Invited a user');
    expect(describeAction('user.password_force_reset')).toBe('Force-reset a password');
  });

  it('names entity types in either naming style', () => {
    expect(entityName('checkIn')).toBe('Check-in');
    expect(entityName('key_result')).toBe('Key Result');
  });

  it('falls back to a tidied code for anything not yet listed', () => {
    expect(describeAction('widget.frobnicated')).toBe('Frobnicated: widget');
    expect(entityName('someNewThing')).toBe('Some new thing');
    expect(describeAction('')).toBe('');
  });
});
