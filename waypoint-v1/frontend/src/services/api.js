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
  changePassword: (currentPassword, newPassword) =>
    request('/auth/change-password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),
};

export const flagsApi = {
  list: () => request('/flags'),
  update: (key, value, valueType, tenantId) =>
    request(`/flags/${key}`, { method: 'PATCH', body: JSON.stringify({ value, valueType, tenantId }) }),
};

export const healthApi = {
  check: () => request('/health'),
};

// ---------- Module 2: core OKR entities ----------

export const cascadeLevelsApi = {
  list: () => request('/settings/cascade-levels'),
  update: (labels) => request('/settings/cascade-levels', { method: 'PUT', body: JSON.stringify({ labels }) }),
};

export const rubricApi = {
  get: () => request('/settings/rubric'),
  update: (name, levels) => request('/settings/rubric', { method: 'PUT', body: JSON.stringify({ name, levels }) }),
};

export const cyclesApi = {
  list: () => request('/cycles'),
  create: ({ name, cadenceId, startDate }) =>
    request('/cycles', { method: 'POST', body: JSON.stringify({ name, cadenceId, startDate }) }),
};

export const cadencesApi = {
  list: () => request('/settings/cadences'),
  create: ({ label, months }) => request('/settings/cadences', { method: 'POST', body: JSON.stringify({ label, months }) }),
  update: (id, { label, months }) => request(`/settings/cadences/${id}`, { method: 'PATCH', body: JSON.stringify({ label, months }) }),
  remove: (id) => request(`/settings/cadences/${id}`, { method: 'DELETE' }),
};

export const okrElementsApi = {
  list: () => request('/settings/okr-elements'),
  update: (elementKey, isEnabled) => request(`/settings/okr-elements/${elementKey}`, { method: 'PATCH', body: JSON.stringify({ isEnabled }) }),
};

export const terminologyApi = {
  get: () => request('/settings/terminology'),
  update: (overrides) => request('/settings/terminology', { method: 'PUT', body: JSON.stringify(overrides) }),
};

export const objectivesApi = {
  list: () => request('/objectives'),
  get: (id) => request(`/objectives/${id}`),
  create: ({ title, cascadeLevelId, parentObjectiveId, ownerId }) =>
    request('/objectives', { method: 'POST', body: JSON.stringify({ title, cascadeLevelId, parentObjectiveId, ownerId }) }),
  update: (id, { title, parentObjectiveId }) =>
    request(`/objectives/${id}`, { method: 'PATCH', body: JSON.stringify({ title, parentObjectiveId }) }),
  createKeyResult: (id, { title, weighting, rubricId }) =>
    request(`/objectives/${id}/key-results`, { method: 'POST', body: JSON.stringify({ title, weighting, rubricId }) }),
};

export const keyResultsApi = {
  update: (id, { title, weighting }) =>
    request(`/key-results/${id}`, { method: 'PATCH', body: JSON.stringify({ title, weighting }) }),
};

// ---------- User management (PlatformAdmin/TenantAdmin) ----------

export const tenantsApi = {
  list: () => request('/tenants'),
  get: (id) => request(`/tenants/${id}`),
  create: ({ name, region, adminEmail, adminFirstName, adminLastName, adminPassword }) =>
    request('/tenants', { method: 'POST', body: JSON.stringify({ name, region, adminEmail, adminFirstName, adminLastName, adminPassword }) }),
};

export const usersApi = {
  list: () => request('/users'),
  invite: ({ role, email, firstName, lastName, password, managerId }) =>
    request('/users/invite', { method: 'POST', body: JSON.stringify({ role, email, firstName, lastName, password, managerId }) }),
  updateRole: (id, role) => request(`/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  forcePasswordReset: (id, password) => request(`/users/${id}/force-password-reset`, { method: 'PUT', body: JSON.stringify({ password }) }),
  unlock: (id) => request(`/users/${id}/unlock`, { method: 'PUT' }),
};

export const meApi = {
  get: () => request('/me'),
  update: ({ theme, avatarOption, timezone }) => request('/me', { method: 'PATCH', body: JSON.stringify({ theme, avatarOption, timezone }) }),
};
