import { ValidationError, NotFoundError } from './errors.js';

/**
 * Self-service "my profile" — theme, avatar, and timezone preference,
 * the settings every role (including PlatformAdmin, who has no tenant)
 * can set for themselves. Deliberately not folded into userService.js
 * (tenant-scoped, admin-driven) or authService.js (credentials) — this
 * is its own small concern, reached via GET/PATCH /api/me regardless of
 * role or tenant.
 *
 * Validated against these lists rather than a Postgres enum, so adding
 * a theme/avatar/timezone option never needs a schema change — see
 * db/migrations/06-user-profile.sql's column comments.
 *
 * Timezone is a stored preference only at this stage — matching
 * MedBroker's Settings page, which has it, but *not* MedBroker's full
 * app-wide "every displayed timestamp converts to it" behaviour
 * (dateFormat.js there). WayPoint hasn't adopted a display-format
 * standard the way MedBroker has (see DatePicker.jsx's own note on the
 * same boundary) — building that conversion layer is separate, larger
 * scope than a settings field, flagged rather than silently assumed.
 */

export const THEME_IDS = ['light', 'dark'];
export const AVATAR_OPTION_IDS = ['grad', 'blue', 'teal', 'violet', 'amber', 'rose'];

// A representative set, not exhaustive — matches the common pattern of
// a curated list (MedBroker's SUPPORTED_TIMEZONES) rather than every
// IANA zone. Add more as real tenants need them.
export const TIMEZONE_IDS = [
  'Africa/Johannesburg',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Singapore',
  'Australia/Sydney',
  'UTC',
];

export async function getOwnProfile(client, userId) {
  const { rows } = await client.query(
    `SELECT id, role, email, first_name AS "firstName", last_name AS "lastName",
            theme, avatar_option AS "avatarOption", timezone
     FROM okr.user_account WHERE id = $1`,
    [userId]
  );
  if (rows.length === 0) throw new NotFoundError('Account not found');
  return rows[0];
}

export async function updateOwnProfile(client, userId, { theme, avatarOption, timezone }) {
  if (theme !== undefined && !THEME_IDS.includes(theme)) {
    throw new ValidationError(`theme must be one of: ${THEME_IDS.join(', ')}`);
  }
  if (avatarOption !== undefined && !AVATAR_OPTION_IDS.includes(avatarOption)) {
    throw new ValidationError(`avatarOption must be one of: ${AVATAR_OPTION_IDS.join(', ')}`);
  }
  if (timezone !== undefined && !TIMEZONE_IDS.includes(timezone)) {
    throw new ValidationError(`timezone must be one of: ${TIMEZONE_IDS.join(', ')}`);
  }
  if (theme === undefined && avatarOption === undefined && timezone === undefined) {
    throw new ValidationError('Nothing to update — provide theme, avatarOption, and/or timezone');
  }

  const existing = await getOwnProfile(client, userId);
  const nextTheme = theme ?? existing.theme;
  const nextAvatarOption = avatarOption ?? existing.avatarOption;
  const nextTimezone = timezone ?? existing.timezone;

  const { rows } = await client.query(
    `UPDATE okr.user_account SET theme = $2, avatar_option = $3, timezone = $4
     WHERE id = $1
     RETURNING id, role, email, first_name AS "firstName", last_name AS "lastName",
               theme, avatar_option AS "avatarOption", timezone`,
    [userId, nextTheme, nextAvatarOption, nextTimezone]
  );
  return rows[0];
}
