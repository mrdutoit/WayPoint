const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';
// Preview mode: no auth backend configured (e.g. a Vercel preview build
// with no environment variables set). Every call returns null so pages
// fall back to inline mock data rather than the app crashing on a missing
// credential — see the preview-safe pattern in code-nodejs.
const PREVIEW_MODE = !import.meta.env.VITE_AUTH_CONFIGURED;

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
  if (PREVIEW_MODE) return null; // pages fall back to mock data

  const response = await fetch(`${API_BASE}${path}`, {
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
