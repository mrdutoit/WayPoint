import { describe, it, expect, vi } from 'vitest';
import { getOwnProfile, updateOwnProfile, THEME_IDS, AVATAR_OPTION_IDS, TIMEZONE_IDS } from '../frontend/api-lib/services/profileService.js';
import { ValidationError, NotFoundError } from '../frontend/api-lib/services/errors.js';

function mockClient() {
  return { query: vi.fn() };
}

describe('getOwnProfile', () => {
  it('throws NotFoundError when the account does not exist', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(getOwnProfile(client, 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns the profile including theme, avatarOption, and timezone', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'u1', theme: 'dark', avatarOption: 'teal', timezone: 'Europe/London' }] });
    const profile = await getOwnProfile(client, 'u1');
    expect(profile.theme).toBe('dark');
    expect(profile.avatarOption).toBe('teal');
    expect(profile.timezone).toBe('Europe/London');
  });
});

describe('updateOwnProfile — validation', () => {
  it('rejects an unknown theme', async () => {
    await expect(updateOwnProfile(mockClient(), 'u1', { theme: 'neon' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an unknown avatarOption', async () => {
    await expect(updateOwnProfile(mockClient(), 'u1', { avatarOption: 'sparkly' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an unknown timezone', async () => {
    await expect(updateOwnProfile(mockClient(), 'u1', { timezone: 'Mars/OlympusMons' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an update with no fields provided', async () => {
    await expect(updateOwnProfile(mockClient(), 'u1', {})).rejects.toBeInstanceOf(ValidationError);
  });

  it('accepts every valid theme id', async () => {
    for (const theme of THEME_IDS) {
      const client = mockClient();
      client.query
        .mockResolvedValueOnce({ rows: [{ id: 'u1', theme: 'light', avatarOption: 'grad', timezone: 'UTC' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'u1', theme, avatarOption: 'grad', timezone: 'UTC' }] });
      const updated = await updateOwnProfile(client, 'u1', { theme });
      expect(updated.theme).toBe(theme);
    }
  });

  it('accepts every valid avatar option id', async () => {
    for (const avatarOption of AVATAR_OPTION_IDS) {
      const client = mockClient();
      client.query
        .mockResolvedValueOnce({ rows: [{ id: 'u1', theme: 'light', avatarOption: 'grad', timezone: 'UTC' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'u1', theme: 'light', avatarOption, timezone: 'UTC' }] });
      const updated = await updateOwnProfile(client, 'u1', { avatarOption });
      expect(updated.avatarOption).toBe(avatarOption);
    }
  });

  it('accepts every valid timezone id', async () => {
    for (const timezone of TIMEZONE_IDS) {
      const client = mockClient();
      client.query
        .mockResolvedValueOnce({ rows: [{ id: 'u1', theme: 'light', avatarOption: 'grad', timezone: 'UTC' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'u1', theme: 'light', avatarOption: 'grad', timezone }] });
      const updated = await updateOwnProfile(client, 'u1', { timezone });
      expect(updated.timezone).toBe(timezone);
    }
  });
});

describe('updateOwnProfile — partial update keeps the other fields unchanged', () => {
  it('updating only theme leaves the existing avatarOption and timezone in place', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'u1', theme: 'light', avatarOption: 'violet', timezone: 'Europe/Berlin' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'u1', theme: 'dark', avatarOption: 'violet', timezone: 'Europe/Berlin' }] });

    await updateOwnProfile(client, 'u1', { theme: 'dark' });
    const updateCall = client.query.mock.calls[1];
    expect(updateCall[1]).toEqual(['u1', 'dark', 'violet', 'Europe/Berlin']); // avatarOption + timezone carried over
  });
});
