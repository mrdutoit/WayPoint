/**
 * constants/avatarOptions.js — same pattern as MedBroker's
 * (constants/avatarOptions.js): the id, not the CSS value, is what
 * persists to user_account.avatar_option (db/06-user-profile.sql), so
 * the actual colours can be retuned here later without a data
 * migration. No image upload, no blob storage — WayPoint has neither
 * set up, and MedBroker doesn't use one for this either; an avatar here
 * is a coloured initials bubble, not a photo.
 *
 * Keep in sync with profileService.js's AVATAR_OPTION_IDS if this list
 * ever changes.
 */

export const AVATAR_OPTIONS = [
  { id: 'grad', value: 'linear-gradient(135deg, var(--brand500), var(--brand700))' },
  { id: 'blue', value: '#2563eb' },
  { id: 'teal', value: '#0d9488' },
  { id: 'violet', value: '#7c3aed' },
  { id: 'amber', value: '#d97706' },
  { id: 'rose', value: '#e11d48' },
];

/** id -> CSS value, with a safe fallback to the default gradient for an
 * unset or unrecognised id (e.g. preview-mode personas, which carry no
 * avatarOption at all). */
export function avatarValue(id) {
  return AVATAR_OPTIONS.find((o) => o.id === id)?.value ?? AVATAR_OPTIONS[0].value;
}
