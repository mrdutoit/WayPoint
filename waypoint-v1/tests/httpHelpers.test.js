import { describe, it, expect } from 'vitest';
import { parseSlug } from '../frontend/api-lib/http/helpers.js';

describe('parseSlug', () => {
  it('returns [] for undefined, null, or empty string (the bare-path case)', () => {
    expect(parseSlug(undefined)).toEqual([]);
    expect(parseSlug(null)).toEqual([]);
    expect(parseSlug('')).toEqual([]);
  });

  it('splits a single-segment string into a one-element array', () => {
    expect(parseSlug('cycle-1')).toEqual(['cycle-1']);
  });

  it('splits a slash-joined multi-segment string — the actual production shape that broke cycle activation', () => {
    expect(parseSlug('cycle-1/activate')).toEqual(['cycle-1', 'activate']);
  });

  it('passes an already-split array through unchanged', () => {
    expect(parseSlug(['cycle-1', 'activate'])).toEqual(['cycle-1', 'activate']);
  });

  it('re-splits any array element that itself still contains a slash', () => {
    expect(parseSlug(['cycle-1/activate'])).toEqual(['cycle-1', 'activate']);
  });

  it('handles three or more segments', () => {
    expect(parseSlug('reset-password/request')).toEqual(['reset-password', 'request']);
  });
});
