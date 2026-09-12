import { ValidationError, NotFoundError } from './errors.js';

/**
 * Self-service "my profile" — theme and avatar preference, the one
 * pair of settings every role (including PlatformAdmin, who has no
 * tenant) can set for themselves. Deliberately not folded into
 * userService.js (tenant-scoped, admin-driven) or authService.js
 * (credentials) — this is its own small concern, reached via
 * GET/PATCH /api/me regardless of role or tenant.
 *
 * Validated against these two lists rather than a Postgres enum, so
 * adding a theme or avatar option never needs a schema change — see
 * db/06-user-profile.sql's column comments.
 */

export const THEME_IDS = ['light', 'dark'];
export const AVATAR_OPTION_IDS = ['grad', 'blue', 'teal', 'violet', 'amber', 'rose'];

export async function getOwnProfile(client, userId) {
  const { rows } = await client.query(
    `SELECT id, role, email, first_name AS "firstName", last_name AS "lastName",
            theme, avatar_option AS "avatarOption"
     FROM okr.user_account WHERE id = $1`,
    [userId]
  );
  if (rows.length === 0) throw new NotFoundError('Account not found');
  return rows[0];
}

export async function updateOwnProfile(client, userId, { theme, avatarOption }) {
  if (theme !== undefined && !THEME_IDS.includes(theme)) {
    throw new ValidationError(`theme must be one of: ${THEME_IDS.join(', ')}`);
  }
  if (avatarOption !== undefined && !AVATAR_OPTION_IDS.includes(avatarOption)) {
    throw new ValidationError(`avatarOption must be one of: ${AVATAR_OPTION_IDS.join(', ')}`);
  }
  if (theme === undefined && avatarOption === undefined) {
    throw new ValidationError('Nothing to update — provide theme and/or avatarOption');
  }

  const existing = await getOwnProfile(client, userId);
  const nextTheme = theme ?? existing.theme;
  const nextAvatarOption = avatarOption ?? existing.avatarOption;

  const { rows } = await client.query(
    `UPDATE okr.user_account SET theme = $2, avatar_option = $3
     WHERE id = $1
     RETURNING id, role, email, first_name AS "firstName", last_name AS "lastName",
               theme, avatar_option AS "avatarOption"`,
    [userId, nextTheme, nextAvatarOption]
  );
  return rows[0];
}
