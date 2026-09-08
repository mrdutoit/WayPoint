// Same-origin now that frontend and API are one Vercel project — no
// VITE_API_BASE_URL, no cross-origin request, no CORS needed for any
// call the deployed frontend itself makes. Relative paths only.

let _token = null;

export function setAuthToken(token) {
  _token = token;
}

export function clearAuthToken() {
  _token = null;
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body?.error ?? 'Request failed');
  return body;
}

export const authApi = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  requestPasswordReset: (email) => request('/auth/reset-password/request', { method: 'POST', body: JSON.stringify({ email }) }),
  confirmPasswordReset: (token, newPassword) => request('/auth/reset-password/confirm', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),
};

export const flagsApi = {
  list: () => request('/flags'),
  update: (key, value, valueType, tenantId) =>
    request(`/flags/${key}`, { method: 'PATCH', body: JSON.stringify({ value, valueType, tenantId }) }),
};

export const healthApi = {
  check: () => request('/health'),
};
