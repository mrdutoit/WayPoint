// Decodes a JWT's payload WITHOUT verifying the signature — every
// request is still verified server-side regardless of what this shows.
// Used only to drive client-side navigation/display (which nav links to
// show, etc.) and to sanity-check expiry before trying to restore a
// session from a stored token on page load.
export function decodeToken(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

export function isTokenExpired(payload) {
  if (!payload?.exp) return true;
  return payload.exp * 1000 <= Date.now();
}
