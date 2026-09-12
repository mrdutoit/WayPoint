import { avatarValue } from '../constants/avatarOptions.js';

function initials(firstName, lastName) {
  const f = firstName?.trim()?.[0] ?? '';
  const l = lastName?.trim()?.[0] ?? '';
  return (f + l).toUpperCase() || '?';
}

/**
 * A coloured initials bubble — see constants/avatarOptions.js for why
 * this is a colour/gradient pick rather than a photo upload.
 *
 * @param {string} firstName
 * @param {string} lastName
 * @param {string} avatarOption - one of AVATAR_OPTIONS' ids
 * @param {number} [size] - diameter in px, default 32
 */
export function Avatar({ firstName, lastName, avatarOption, size = 32 }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: avatarValue(avatarOption),
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.4, fontWeight: 700, flexShrink: 0,
        fontFamily: 'inherit',
      }}
      aria-hidden="true"
    >
      {initials(firstName, lastName)}
    </div>
  );
}
