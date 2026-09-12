import { describe, it, expect, vi } from 'vitest';
import { getOwnProfile, updateOwnProfile, THEME_IDS, AVATAR_OPTION_IDS } from '../frontend/api-lib/services/profileService.js';
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

  it('returns the profile including theme and avatarOption', async () => {
    const client = mockClient();
    client.query.mockResolvedValueOnce({ rows: [{ id: 'u1', theme: 'dark', avatarOption: 'teal' }] });
    const profile = await getOwnProfile(client, 'u1');
    expect(profile.theme).toBe('dark');
    expect(profile.avatarOption).toBe('teal');
  });
});

describe('updateOwnProfile — validation', () => {
  it('rejects an unknown theme', async () => {
    await expect(updateOwnProfile(mockClient(), 'u1', { theme: 'neon' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an unknown avatarOption', async () => {
    await expect(updateOwnProfile(mockClient(), 'u1', { avatarOption: 'sparkly' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an update with neither field provided', async () => {
    await expect(updateOwnProfile(mockClient(), 'u1', {})).rejects.toBeInstanceOf(ValidationError);
  });

  it('accepts every valid theme id', async () => {
    for (const theme of THEME_IDS) {
      const client = mockClient();
      client.query
        .mockResolvedValueOnce({ rows: [{ id: 'u1', theme: 'light', avatarOption: 'grad' }] }) // existing
        .mockResolvedValueOnce({ rows: [{ id: 'u1', theme, avatarOption: 'grad' }] }); // update
      const updated = await updateOwnProfile(client, 'u1', { theme });
      expect(updated.theme).toBe(theme);
    }
  });

  it('accepts every valid avatar option id', async () => {
    for (const avatarOption of AVATAR_OPTION_IDS) {
      const client = mockClient();
      client.query
        .mockResolvedValueOnce({ rows: [{ id: 'u1', theme: 'light', avatarOption: 'grad' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'u1', theme: 'light', avatarOption }] });
      const updated = await updateOwnProfile(client, 'u1', { avatarOption });
      expect(updated.avatarOption).toBe(avatarOption);
    }
  });
});

describe('updateOwnProfile — partial update keeps the other field unchanged', () => {
  it('updating only theme leaves the existing avatarOption in place', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'u1', theme: 'light', avatarOption: 'violet' }] }) // existing
      .mockResolvedValueOnce({ rows: [{ id: 'u1', theme: 'dark', avatarOption: 'violet' }] });

    await updateOwnProfile(client, 'u1', { theme: 'dark' });
    const updateCall = client.query.mock.calls[1];
    expect(updateCall[1]).toEqual(['u1', 'dark', 'violet']); // avatarOption carried over, not reset
  });
});
